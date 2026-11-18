// DB-backed: runs against the database in DATABASE_URL (npm run test:db) —
// a throwaway one, never real data. A project's needs as the assistant adds
// them (the card's "Liste einfügen" goes through the same addNeeds): names
// matched against the catalogue, an entry already on the list filled rather
// than doubled, new entries only for the office, a site manager only on
// their own projects.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => undefined }))

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-needs-${Date.now()}`
const ids = { employee: '', managed: '', foreign: '', customer: '', paint: '', roller: '', device: '' }
const users: Record<'admin' | 'siteManager', unknown> = { admin: null, siteManager: null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: keyof typeof users): any => ({ user: users[who], via: 'session', keyId: null, keyName: null })

beforeAll(async () => {
  const employee = await prisma.employee.create({ data: { firstName: 'Erika', lastName: TAG } })
  ids.employee = employee.id
  users.admin = await prisma.user.create({ data: { username: `${TAG}-admin`, passwordHash: 'x', role: 'ADMIN' }, include: { employee: true } })
  users.siteManager = await prisma.user.create({
    data: { username: `${TAG}-site`, passwordHash: 'x', role: 'SITE_MANAGER', employee: { connect: { id: employee.id } } },
    include: { employee: true },
  })
  const customer = await prisma.customer.create({ data: { name: `${TAG} Muster GmbH` } })
  ids.customer = customer.id
  const project = (suffix: string, extra: object) =>
    prisma.project.create({ data: { number: `${TAG}-${suffix}`, name: `${TAG} ${suffix}`, customerId: customer.id, ...extra }, select: { id: true } })
  ids.managed = (await project('managed', { managerId: employee.id })).id
  ids.foreign = (await project('foreign', {})).id
  ids.paint = (await prisma.catalogItem.create({ data: { kind: 'MATERIAL', name: `${TAG} Dispersionsfarbe weiß`, unit: 'Eimer' } })).id
  ids.roller = (await prisma.catalogItem.create({ data: { kind: 'TOOL', name: `${TAG} Farbroller` } })).id
  ids.device = (await prisma.device.create({ data: { name: `${TAG} Airless`, inventoryNo: `${TAG}-M1` } })).id
  await prisma.projectItem.create({ data: { projectId: ids.managed, catalogItemId: ids.paint, quantity: 6 } })
})

afterAll(async () => {
  await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.catalogItem.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.device.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } })
  await prisma.employee.deleteMany({ where: { lastName: TAG } })
  await prisma.$disconnect()
})

describe('add_project_needs', () => {
  it('matches names, fills a row already there instead of doubling it, and adds machines', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const result = (await runTool(
      'add_project_needs',
      {
        project: ids.managed,
        items: [
          { name: `${TAG} Dispersionsfarbe weiß`, quantity: 10, note: 'matt' },
          { name: `${TAG} Farbrollen`, quantity: 3 },
          { name: `${TAG} Silikon` },
        ],
        machines: [`${TAG}-M1`],
      },
      as('siteManager')
    )) as { items: { added: number; filled: number }; notInCatalog: Array<{ name: string }>; machines: { added: string[] } }
    expect(result.items).toMatchObject({ added: 1, filled: 1 })
    expect(result.notInCatalog.map((u) => u.name)).toEqual([`${TAG} Silikon`])
    expect(result.machines.added).toEqual([`${TAG} Airless`])

    const rows = await prisma.projectItem.findMany({ where: { projectId: ids.managed }, orderBy: { catalogItemId: 'asc' } })
    const paint = rows.find((r) => r.catalogItemId === ids.paint)!
    // The quantity the office typed stays; the empty note is filled.
    expect(Number(paint.quantity)).toBe(6)
    expect(paint.note).toBe('matt')
    expect(Number(rows.find((r) => r.catalogItemId === ids.roller)!.quantity)).toBe(3)
  })

  it('makes an unknown name only for the office, and only when asked', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const name = `${TAG} Silikon`
    await runTool('add_project_needs', { project: ids.managed, items: [{ name }], createMissing: true }, as('siteManager'))
    expect(await prisma.catalogItem.count({ where: { name } })).toBe(0)
    await runTool('add_project_needs', { project: ids.managed, items: [{ name, kind: 'Material' }], createMissing: true }, as('admin'))
    expect(await prisma.catalogItem.count({ where: { name, kind: 'MATERIAL' } })).toBe(1)
  })

  it('keeps a site manager off projects they are not named on', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    await expect(runTool('add_project_needs', { project: ids.foreign, items: [{ name: `${TAG} Farbroller` }] }, as('siteManager'))).rejects.toThrow(
      'No such project'
    )
    await expect(runTool('get_project_needs', { project: ids.foreign }, as('siteManager'))).rejects.toThrow('No such project')
  })

  it('reads the needs back grouped by kind, with the machines', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const needs = (await runTool('get_project_needs', { project: ids.managed }, as('siteManager'))) as {
      items: Array<{ kind: string; name: string; quantity: number | null; unit: string | null }>
      machines: Array<{ id: string }>
    }
    expect(needs.items.find((i) => i.name.endsWith('Dispersionsfarbe weiß'))).toMatchObject({ kind: 'MATERIAL', quantity: 6, unit: 'Eimer' })
    expect(needs.machines.map((m) => m.id)).toEqual([ids.device])
    const catalog = (await runTool('list_catalog', { query: TAG, kind: 'TOOL' }, as('siteManager'))) as Array<{ name: string }>
    expect(catalog.map((c) => c.name)).toEqual([`${TAG} Farbroller`])
  })
})
