// DB-backed: runs against the database in DATABASE_URL (npm run test:db) —
// a throwaway one, never real data. A project's name is its customer and its
// trades (src/lib/project-title.ts), kept current wherever one of them changes:
// through the tools an automation or the assistant uses, and when a trade is
// renamed in Settings.
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => undefined }))
vi.mock('@/lib/project-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/project-events')>()),
  announceProjectCreated: async () => {},
  announceProjectChanges: async () => {},
}))

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-title-${Date.now()}`
// Trade names are matched by their letters only, so the run's own are letters too.
const LETTERS = Date.now().toString(26).replace(/\d/g, (d) => 'qrstuvwxyz'[Number(d)])
const ids = { customer: '', user: '', paint: '', drywall: '', lead: '' }
let paint = ''
let drywall = ''
let lead = ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let as: any

beforeAll(async () => {
  const user = await prisma.user.create({ data: { username: TAG, passwordHash: 'x', role: 'ADMIN' }, include: { employee: true } })
  ids.user = user.id
  as = { user, via: 'session', keyId: null, keyName: null }
  ids.customer = (await prisma.customer.create({ data: { name: `${TAG} Muster GmbH` } })).id
  paint = `Malerei${LETTERS}`
  drywall = `Trockenbau${LETTERS}`
  ids.paint = (await prisma.workCategory.create({ data: { nameDe: paint, nameEn: paint, sortOrder: 900 } })).id
  ids.drywall = (await prisma.workCategory.create({ data: { nameDe: drywall, nameEn: drywall, sortOrder: 901 } })).id
  lead = `Lead Anzeige ${LETTERS}`
  ids.lead = (await prisma.workCategory.create({ data: { nameDe: lead, nameEn: lead, sortOrder: 902 } })).id
})

afterAll(async () => {
  await prisma.project.deleteMany({ where: { customerId: ids.customer } })
  await prisma.customer.deleteMany({ where: { id: ids.customer } })
  await prisma.workCategory.deleteMany({ where: { id: { in: [ids.paint, ids.drywall, ids.lead] } } })
  await prisma.auditLog.deleteMany({ where: { userId: ids.user } })
  await prisma.user.deleteMany({ where: { id: ids.user } })
  await prisma.$disconnect()
})

describe('the name of a project', () => {
  let projectId = ''

  it('is the customer and the trades when it is made, the name sent kept as the old title', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const made = (await runTool('create_project', { customerId: ids.customer, trades: [paint], name: 'Musterhof Fassade' }, as)) as {
      id: string
      name: string
      trades: string[]
      sourceTitle: string | null
    }
    projectId = made.id
    expect(made.name).toBe(`${TAG} Muster GmbH · ${paint}`)
    expect(made.trades).toEqual([paint])
    expect(made.sourceTitle).toBe('Musterhof Fassade')
  })

  it('follows the trades, in the order Settings lists them, and falls back to the old title without one', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const both = (await runTool('update_project', { project: projectId, trades: [drywall, paint] }, as)) as { name: string }
    expect(both.name).toBe(`${TAG} Muster GmbH · ${paint}, ${drywall}`)
    const none = (await runTool('update_project', { project: projectId, trades: [] }, as)) as { name: string }
    expect(none.name).toBe('Musterhof Fassade')
  })

  it('names the work note after the trades, and alone where there is no trade', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const noted = (await runTool('update_project', { project: projectId, trades: [paint], workNote: 'Küche' }, as)) as { name: string; workNote: string }
    expect(noted).toMatchObject({ name: `${TAG} Muster GmbH · ${paint}, Küche`, workNote: 'Küche' })
    const alone = (await runTool('update_project', { project: projectId, trades: [] }, as)) as { name: string }
    expect(alone.name).toBe(`${TAG} Muster GmbH · Küche`)
    const cleared = (await runTool('update_project', { project: projectId, workNote: null }, as)) as { name: string; workNote: string | null }
    expect(cleared).toMatchObject({ name: 'Musterhof Fassade', workNote: null })
  })

  it('refuses a trade that does not exist rather than leave it out of the name', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    await expect(runTool('update_project', { project: projectId, trades: ['Keingewerkdasesgibt'] }, as)).rejects.toThrow('No such trade')
  })

  it('follows the customer when the customer is renamed', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    await runTool('update_project', { project: projectId, trades: [paint] }, as)
    await runTool('update_customer', { customerId: ids.customer, name: `${TAG} Beispiel KG` }, as)
    const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } })
    expect(row.name).toBe(`${TAG} Beispiel KG · ${paint}`)
  })

  it('follows a trade renamed in Settings', async () => {
    const { refreshProjectTitles } = await import('@/lib/project-title-db')
    await prisma.workCategory.update({ where: { id: ids.paint }, data: { nameDe: `${paint}x` } })
    const changed = await refreshProjectTitles({ workCategories: { some: { workCategoryId: ids.paint } } })
    expect(changed).toEqual([projectId])
    const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } })
    expect(row.name).toBe(`${TAG} Beispiel KG · ${paint}x`)
    // Nothing to do the second time.
    expect(await refreshProjectTitles({ id: projectId })).toEqual([])
  })
})

describe('what is no work on a site', () => {
  it('stays on the project but out of its name, the migration naming it as the code does', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const { refreshProjectTitles } = await import('@/lib/project-title-db')
    const make = async (args: Record<string, unknown>) =>
      ((await runTool('create_project', { customerId: ids.customer, ...args }, as)) as { id: string; name: string }).id
    const withTrade = await make({ trades: [drywall, lead], name: 'Musterhof Innen' })
    const alone = await make({ trades: [lead], name: 'Muster Kampagne' })
    const noted = await make({ trades: [lead], workNote: 'Küche', name: 'Musterhof Küche' })

    // Named the way the first migration named them, the marketing label included.
    const customer = (await prisma.customer.findUniqueOrThrow({ where: { id: ids.customer } })).name
    await prisma.project.updateMany({ where: { id: { in: [withTrade, alone, noted] } }, data: { name: `${customer} · ${lead}` } })
    await prisma.$executeRawUnsafe(
      readFileSync('prisma/migrations/20261103090000_project_title_not_work/migration.sql', 'utf8')
    )

    const names = await prisma.project.findMany({
      where: { id: { in: [withTrade, alone, noted] } },
      select: { id: true, name: true, workCategories: { select: { workCategoryId: true } } },
    })
    const by = new Map(names.map((p) => [p.id, p]))
    expect(by.get(withTrade)?.name).toBe(`${customer} · ${drywall}`)
    expect(by.get(alone)?.name).toBe('Muster Kampagne')
    expect(by.get(noted)?.name).toBe(`${customer} · Küche`)
    // The label itself stays on the project.
    expect(by.get(alone)?.workCategories.map((w) => w.workCategoryId)).toEqual([ids.lead])
    // And the code finds nothing to change.
    expect(await refreshProjectTitles({ id: { in: [withTrade, alone, noted] } })).toEqual([])
  })
})
