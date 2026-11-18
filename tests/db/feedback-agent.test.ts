// DB-backed: runs against a throwaway database (npm run test:db).
// The feedback list as a coding agent reaches it over MCP with a "feedback"
// key: the items and their pictures, notes, proposals and statuses — and
// nothing else of the app, and never done.
import 'dotenv/config'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => undefined }))

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-feedback-agent-${Date.now()}`
const storage = mkdtempSync(path.join(tmpdir(), 'feedback-agent-test-'))
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let agent: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let siteManager: any = null
let itemNumber = 0
let imageId = ''
let officeItemNumber = 0
const keys = { feedback: '', full: '' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asKey = (user: unknown, scope: 'feedback' | null): any => ({ user, via: 'key', keyId: null, keyName: TAG, scope })

beforeAll(async () => {
  process.env.FILE_STORAGE_DIR = storage
  agent = await prisma.user.create({ data: { username: `${TAG}-agent`, passwordHash: 'x', role: 'MANAGER' }, include: { employee: true } })
  siteManager = await prisma.user.create({ data: { username: `${TAG}-site`, passwordHash: 'x', role: 'SITE_MANAGER' }, include: { employee: true } })
  const crew = await prisma.user.create({ data: { username: `${TAG}-crew`, passwordHash: 'x', role: 'EMPLOYEE' } })
  const { createFeedback } = await import('@/lib/feedback-db')
  // A comment from the crew with a screenshot, and one of the office's own.
  const made = await createFeedback(
    { id: crew.id, officeOnly: false },
    { title: `${TAG} Knopf zu klein`, comment: `${TAG} Der Knopf ist auf dem Handy zu klein.`, page: '/my', anchor: null, metadata: null },
    [{ kind: 'screenshot', file: new File([PNG], 'Screenshot.png', { type: 'image/png' }), width: 1, height: 1 }]
  )
  if ('error' in made) throw new Error(made.error)
  itemNumber = made.number
  imageId = (await prisma.feedbackAttachment.findFirstOrThrow({ where: { itemId: made.id } })).id
  const office = await createFeedback(
    { id: agent.id, officeOnly: true },
    { title: `${TAG} Preise`, comment: `${TAG} Preisspalte prüfen`, page: '/projects', anchor: null, metadata: null },
    []
  )
  if ('error' in office) throw new Error(office.error)
  officeItemNumber = office.number

  const { newApiKey } = await import('@/lib/api-keys')
  for (const scope of ['feedback', null] as const) {
    const key = newApiKey()
    await prisma.apiKey.create({ data: { name: TAG, prefix: key.prefix, tokenHash: key.hash, scope, userId: agent.id } })
    keys[scope ?? 'full'] = key.token
  }
})

afterAll(async () => {
  await prisma.feedbackItem.deleteMany({ where: { title: { startsWith: TAG } } })
  await prisma.apiKey.deleteMany({ where: { name: TAG } })
  await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } })
  await prisma.$disconnect()
  rmSync(storage, { recursive: true, force: true })
})

describe('a feedback key at the doors', () => {
  const request = (token: string) => new Request('http://localhost/api/mcp', { headers: { authorization: `Bearer ${token}` } })

  it('opens the MCP door, but not the REST API', async () => {
    const { authenticateApi } = await import('@/lib/api-auth')
    expect(await authenticateApi(request(keys.feedback))).toBeNull()
    expect((await authenticateApi(request(keys.feedback), ['feedback']))?.scope).toBe('feedback')
    // A full key opens both, as before.
    expect((await authenticateApi(request(keys.full)))?.scope).toBeNull()
    expect((await authenticateApi(request(keys.full), ['feedback']))?.scope).toBeNull()
  })

  it('is offered the feedback tools only, and refused the rest when it calls them anyway', async () => {
    const { mcpToolsFor, runTool } = await import('@/lib/mcp-tools')
    const names = mcpToolsFor(asKey(agent, 'feedback')).map((t) => t.name)
    expect(names).toContain('list_feedback')
    expect(names).not.toContain('list_projects')
    await expect(runTool('list_projects', {}, asKey(agent, 'feedback'))).rejects.toThrow('Unknown tool')
  })
})

describe('the agent working off the list', () => {
  it('reads the open items with their instructions, and one by number', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const list = (await runTool('list_feedback', { search: TAG }, asKey(agent, 'feedback'))) as {
      instructions: string
      items: Array<{ number: number; images: Array<{ id: string }> }>
    }
    expect(list.instructions).toContain('get_feedback_image')
    expect(list.items.map((i) => i.number)).toEqual([itemNumber, officeItemNumber])
    const one = (await runTool('get_feedback', { number: itemNumber }, asKey(agent, 'feedback'))) as { title: string; images: Array<{ id: string }> }
    expect(one.title).toBe(`${TAG} Knopf zu klein`)
    expect(one.images.map((i) => i.id)).toEqual([imageId])
  })

  it('gets the screenshot itself, as an image', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const { McpContent } = await import('@/lib/mcp')
    const picture = await runTool('get_feedback_image', { imageId }, asKey(agent, 'feedback'))
    expect(picture).toBeInstanceOf(McpContent)
    expect((picture as InstanceType<typeof McpContent>).content).toEqual([{ type: 'image', data: PNG.toString('base64'), mimeType: 'image/png' }])
  })

  it('writes a note, records a proposal and moves the item — every field it did not send stays', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const as = asKey(agent, 'feedback')
    await runTool('add_feedback_note', { number: itemNumber, body: 'Gefunden in src/app/my/page.tsx' }, as)
    await runTool('record_feedback_proposal', { number: itemNumber, suggestion: 'Knopf auf 44 px', waitingOn: 'owner' }, as)
    await runTool('set_feedback_status', { number: itemNumber, status: 'IN_PROGRESS' }, as)
    const row = await prisma.feedbackItem.findUniqueOrThrow({ where: { number: itemNumber }, include: { notes: true, changes: true } })
    expect(row.title).toBe(`${TAG} Knopf zu klein`)
    expect(row.suggestion).toBe('Knopf auf 44 px')
    expect(row.waitingOn).toBe('owner')
    expect(row.status).toBe('IN_PROGRESS')
    expect(row.notes.map((n) => [n.choice, n.body, n.authorId])).toEqual([['note', 'Gefunden in src/app/my/page.tsx', agent.id]])
    expect(row.changes.at(-1)).toMatchObject({ fromStatus: 'INBOX', toStatus: 'IN_PROGRESS', changedById: agent.id })
  })

  it('never marks an item done', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    await expect(runTool('set_feedback_status', { number: itemNumber, status: 'DONE' }, asKey(agent, 'feedback'))).rejects.toThrow('Invalid input')
    expect((await prisma.feedbackItem.findUniqueOrThrow({ where: { number: itemNumber } })).status).toBe('IN_PROGRESS')
  })

  it('adds what it finds as an item of its own', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const added = (await runTool('add_feedback', { comment: `${TAG} Doppelte Abfrage auf der Übersicht`, page: '/dashboard', waitingOn: 'owner' }, asKey(agent, 'feedback'))) as { number: number }
    const row = await prisma.feedbackItem.findUniqueOrThrow({ where: { number: added.number } })
    expect(row).toMatchObject({ source: 'agent', status: 'INBOX', waitingOn: 'owner', page: '/dashboard', authorId: agent.id })
  })
})

describe('a site manager over MCP', () => {
  it("never sees the office's own items, and may not record proposals", async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const as = asKey(siteManager, 'feedback')
    await expect(runTool('get_feedback', { number: officeItemNumber }, as)).rejects.toThrow('not visible')
    await expect(runTool('record_feedback_proposal', { number: itemNumber, suggestion: 'x' }, as)).rejects.toThrow('Unknown tool')
    const list = (await runTool('list_feedback', { search: TAG }, as)) as { items: Array<{ number: number }> }
    expect(list.items.map((i) => i.number)).not.toContain(officeItemNumber)
  })
})
