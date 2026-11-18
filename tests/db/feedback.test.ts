// DB-backed: runs against a throwaway database (npm run test:db).
// The feedback tool's database side: who sees what, versions that refuse a
// stale save, pictures checked by their bytes and removed with their item.
import 'dotenv/config'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-feedback-${Date.now()}`
const storage = mkdtempSync(path.join(tmpdir(), 'feedback-test-'))
let office = { id: '', role: 'ADMIN' }
let crew = { id: '', role: 'EMPLOYEE' }
let other = { id: '', role: 'EMPLOYEE' }

// The smallest PNG there is: one transparent pixel.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const png = (name = 'Screenshot.png') => new File([PNG], name, { type: 'image/png' })

beforeAll(async () => {
  process.env.FILE_STORAGE_DIR = storage
  const make = (role: 'ADMIN' | 'EMPLOYEE', suffix: string) =>
    prisma.user.create({ data: { username: `${TAG}-${suffix}`, passwordHash: 'x', role }, select: { id: true, role: true } })
  office = await make('ADMIN', 'office')
  crew = await make('EMPLOYEE', 'crew')
  other = await make('EMPLOYEE', 'other')
})

afterAll(async () => {
  await prisma.feedbackItem.deleteMany({ where: { title: { startsWith: TAG } } })
  await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } })
  await prisma.$disconnect()
  rmSync(storage, { recursive: true, force: true })
})

const input = (title: string, page = `/${TAG}`) => ({ title: `${TAG} ${title}`, comment: `${TAG} ${title}`, page, anchor: { selector: 'main', text: 'x', x: 0.5, y: 0.5 }, metadata: { os: 'iOS' } })

describe('feedback in the database', () => {
  it('keeps what the office wrote from the crew, in the list, the item and the pins', async () => {
    const { createFeedback, getFeedback, listFeedback, pinsFor } = await import('@/lib/feedback-db')
    const mine = await createFeedback({ id: office.id, officeOnly: true }, input('office'), [{ kind: 'screenshot', file: png(), width: 1, height: 1 }])
    const theirs = await createFeedback({ id: crew.id, officeOnly: false }, input('crew'), [])
    if ('error' in mine || 'error' in theirs) throw new Error('not created')

    const seenByCrew = (await listFeedback(other)).map((i) => i.id)
    expect(seenByCrew).toContain(theirs.id)
    expect(seenByCrew).not.toContain(mine.id)
    expect(await getFeedback(other, mine.id)).toBeNull()
    expect((await pinsFor(other, `/${TAG}`)).map((p) => p.id)).toEqual([theirs.id])
    expect((await pinsFor(office, `/${TAG}`)).map((p) => p.id).sort()).toEqual([mine.id, theirs.id].sort())

    const full = await getFeedback(office, mine.id)
    expect(full?.attachments).toHaveLength(1)
    expect(full?.changes.map((c) => [c.from, c.to])).toEqual([[null, 'INBOX']])
    expect(theirs.number).toBeGreaterThan(mine.number)
  })

  it('refuses a picture that is not one, and leaves no item behind', async () => {
    const { createFeedback } = await import('@/lib/feedback-db')
    const fake = new File(['<svg onload="alert(1)"/>'], 'x.png', { type: 'image/png' })
    expect(await createFeedback({ id: crew.id, officeOnly: false }, input('fake'), [{ kind: 'screenshot', file: fake, width: 1, height: 1 }])).toEqual({ error: 'badImage' })
    expect(await prisma.feedbackItem.count({ where: { title: `${TAG} fake` } })).toBe(0)
  })

  it('refuses an edit or a note made on an older version, and keeps the history', async () => {
    const { addFeedbackNote, createFeedback, editFeedback, getFeedback, setFeedbackStatus } = await import('@/lib/feedback-db')
    const created = await createFeedback({ id: crew.id, officeOnly: false }, input('versions'), [])
    if ('error' in created) throw new Error('not created')
    const item = (await getFeedback(office, created.id))!
    const edit = { title: item.title, comment: item.comment, status: 'TODO' as const, waitingOn: 'agent' as const, suggestion: 'Größer', decision: '', beforeText: '32px', afterText: '44px', completionNote: '', version: item.version }

    expect(await editFeedback(office, item.id, edit)).toEqual({})
    expect(await editFeedback(office, item.id, edit)).toEqual({ error: 'stale' })

    const proposed = (await getFeedback(office, item.id))!
    expect(proposed.version).toBe(2)
    expect(await addFeedbackNote(office, proposed, { choice: 'accept', body: '' })).toEqual({})
    expect(await addFeedbackNote(office, proposed, { choice: 'note', body: 'zu spät' })).toEqual({ error: 'stale' })

    await setFeedbackStatus(office, item.id, 'DONE')
    const done = (await getFeedback(office, item.id))!
    expect(done.status).toBe('DONE')
    expect(done.changes.map((c) => c.to)).toEqual(['INBOX', 'TODO', 'DONE'])
    expect(done.notes[0]).toMatchObject({ choice: 'accept', itemVersion: 2 })
    expect(done.notes[0].evidence).toMatchObject({ suggestion: 'Größer', afterText: '44px' })
  })

  it('removes the pictures from storage with their item', async () => {
    const { createFeedback, deleteFeedback } = await import('@/lib/feedback-db')
    const created = await createFeedback({ id: crew.id, officeOnly: false }, input('delete'), [{ kind: 'upload', file: png('Foto.png'), width: 1, height: 1 }])
    if ('error' in created) throw new Error('not created')
    const [file] = await prisma.feedbackAttachment.findMany({ where: { itemId: created.id } })
    expect(existsSync(path.join(storage, file.path))).toBe(true)
    expect(await deleteFeedback(created.id)).toEqual({})
    expect(existsSync(path.join(storage, file.path))).toBe(false)
    expect(await deleteFeedback(created.id)).toEqual({ error: 'notFound' })
  })
})
