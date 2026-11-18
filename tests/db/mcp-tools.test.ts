// DB-backed: runs against the database in DATABASE_URL (npm run test:db) —
// a throwaway one, never real data. The assistant's and the MCP server's
// tools as different users: a site manager only on their own projects and
// never on the customers, money only for those who may see it, the client's
// Projektnummer kept unique, board columns and schedule days changed the way
// the pages change them.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => undefined }))
// The events are not what is tested here, and the webhook test running beside
// this file counts every delivery its endpoint gets.
vi.mock('@/lib/project-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/project-events')>()),
  announceProjectCreated: async () => {},
  announceProjectChanges: async () => {},
}))

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-mcp-${Date.now()}`
const ids = { employee: '', managed: '', foreign: '', customer: '', board: '', paused: '', plain: '', vehicle: '' }
const users: Record<'admin' | 'manager' | 'siteManager', unknown> = { admin: null, manager: null, siteManager: null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: keyof typeof users): any => ({ user: users[who], via: 'session', keyId: null, keyName: null, scope: null })

beforeAll(async () => {
  const employee = await prisma.employee.create({ data: { firstName: 'Erika', lastName: TAG } })
  ids.employee = employee.id
  const make = async (role: 'ADMIN' | 'MANAGER' | 'SITE_MANAGER', suffix: string, extra: object = {}) => {
    const row = await prisma.user.create({ data: { username: `${TAG}-${suffix}`, passwordHash: 'x', role, ...extra }, include: { employee: true } })
    return row
  }
  users.admin = await make('ADMIN', 'admin')
  users.manager = await make('MANAGER', 'manager', { canViewFinancials: false })
  users.siteManager = await make('SITE_MANAGER', 'site', { employee: { connect: { id: employee.id } } })
  const customer = await prisma.customer.create({ data: { name: `${TAG} Muster GmbH` } })
  ids.customer = customer.id
  const project = (suffix: string, extra: object) =>
    prisma.project.create({
      data: { number: `${TAG}-${suffix}`, name: `${TAG} ${suffix}`, customerId: customer.id, price: 12000, status: 'APPROVED', ...extra },
      select: { id: true },
    })
  ids.managed = (await project('managed', { managerId: employee.id })).id
  ids.foreign = (await project('foreign', {})).id
  const board = await prisma.board.create({
    data: {
      name: TAG,
      columns: {
        create: [
          { status: 'APPROVED', sortOrder: 0 },
          { status: 'APPROVED', rule: 'paused', title: 'Pausiert', sortOrder: 1 },
          { status: 'PLANNED', sortOrder: 2 },
        ],
      },
    },
    include: { columns: true },
  })
  ids.board = board.id
  ids.paused = board.columns.find((c) => c.rule === 'paused')!.id
  ids.plain = board.columns.find((c) => c.status === 'PLANNED')!.id
  ids.vehicle = (await prisma.vehicle.create({ data: { name: `${TAG} Sprinter` } })).id
})

afterAll(async () => {
  const userIds = Object.values(users).map((u) => (u as { id: string }).id)
  await prisma.scheduleEntry.deleteMany({ where: { project: { name: { startsWith: TAG } } } })
  await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.board.deleteMany({ where: { id: ids.board } })
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } })
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await prisma.employee.deleteMany({ where: { id: ids.employee } })
  await prisma.$disconnect()
})

describe('a site manager through the tools', () => {
  it('lists and reads only the projects they are named on', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const list = (await runTool('list_projects', { query: TAG }, as('siteManager'))) as { items: Array<{ id: string }> }
    expect(list.items.map((p) => p.id)).toEqual([ids.managed])
    await expect(runTool('get_project', { project: ids.foreign }, as('siteManager'))).rejects.toThrow('No such project')
    await expect(runTool('update_project', { project: ids.foreign, city: 'Musterstadt' }, as('siteManager'))).rejects.toThrow(
      'No such project'
    )
    await expect(runTool('add_comment', { project: ids.foreign, body: 'Hallo' }, as('siteManager'))).rejects.toThrow('No such project')
  })

  it('may change their own project but never sees or sets its price', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const changed = (await runTool('update_project', { project: ids.managed, city: 'Musterstadt' }, as('siteManager'))) as Record<string, unknown>
    expect((changed.address as { city: string }).city).toBe('Musterstadt')
    expect(changed).not.toHaveProperty('price')
    await expect(runTool('update_project', { project: ids.managed, price: 1 }, as('siteManager'))).rejects.toThrow('may not set: price')
    expect((await prisma.project.findUnique({ where: { id: ids.managed } }))!.price!.toString()).toBe('12000')
  })

  it('is refused the customers and the revenue', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    await expect(runTool('search_customers', { query: TAG }, as('siteManager'))).rejects.toThrow('Unknown tool')
    await expect(runTool('revenue_by_month', { year: 2026 }, as('siteManager'))).rejects.toThrow('Unknown tool')
    const { listCustomers } = await import('@/lib/api-service')
    await expect(listCustomers(users.siteManager as never, TAG)).rejects.toThrow('master data')
  })

  it('owns the project it creates, so it can see it afterwards', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const made = (await runTool('create_project', { name: `${TAG} made`, customerName: `${TAG} Muster GmbH` }, as('siteManager'))) as {
      id: string
      manager: { id: string }
    }
    expect(made.manager.id).toBe(ids.employee)
  })
})

describe('money', () => {
  it('reaches an admin, and not a manager without financial access', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const forAdmin = (await runTool('get_project', { project: ids.foreign }, as('admin'))) as Record<string, unknown>
    expect(forAdmin.price).toBe(12000)
    const forManager = (await runTool('get_project', { project: ids.foreign }, as('manager'))) as Record<string, unknown>
    expect(forManager).not.toHaveProperty('price')
    expect(forManager).not.toHaveProperty('orderValue')
    expect(JSON.stringify(forManager)).not.toContain('12000')
  })
})

describe('the Projektnummer', () => {
  it('is set, found by, and never given to two projects', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    const number = `${Date.now()}`.slice(-9)
    await runTool('update_project', { project: ids.foreign, jobNumber: number }, as('admin'))
    const found = (await runTool('get_project', { project: number }, as('admin'))) as { id: string; jobNumber: string }
    expect(found).toMatchObject({ id: ids.foreign, jobNumber: number })
    await expect(runTool('update_project', { project: ids.managed, jobNumber: number }, as('admin'))).rejects.toThrow('already has')
    await runTool('update_project', { project: ids.foreign, jobNumber: null }, as('admin'))
    expect((await prisma.project.findUnique({ where: { id: ids.foreign } }))!.jobNumber).toBeNull()
  })
})

describe('board columns', () => {
  it("move a project into a rule's column with what the rule asks, and out of it again", async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    await runTool('move_project_to_column', { project: ids.foreign, columnId: ids.paused }, as('admin'))
    expect((await prisma.project.findUnique({ where: { id: ids.foreign } }))!.pausedAt).not.toBeNull()
    const moved = (await runTool('move_project_to_column', { project: ids.foreign, columnId: ids.plain }, as('admin'))) as { status: string }
    expect(moved.status).toBe('PLANNED')
    expect((await prisma.project.findUnique({ where: { id: ids.foreign } }))!.pausedAt).toBeNull()
  })
})

describe('schedule days', () => {
  it('are planned, changed, moved and taken out of the plan without being deleted', async () => {
    const { runTool } = await import('@/lib/mcp-tools')
    await runTool('plan_assignment', { projectId: ids.managed, date: '2031-03-03' }, as('admin'))
    const entry = await prisma.scheduleEntry.findFirstOrThrow({ where: { projectId: ids.managed, date: new Date('2031-03-03T00:00:00Z') } })
    await runTool('update_schedule_entry', { entryId: entry.id, employeeIds: [ids.employee], vehicleIds: [ids.vehicle], note: 'Gerüst' }, as('admin'))
    const moved = (await runTool('move_schedule_entry', { entryId: entry.id, date: '2031-03-04' }, as('admin'))) as { url: string }
    expect(moved.url).toBe('/schedule?date=2031-03-04')
    const after = await prisma.scheduleEntry.findUniqueOrThrow({ where: { id: entry.id }, include: { employees: true, vehicles: true } })
    expect(after.note).toBe('Gerüst')
    expect(after.employees.map((e) => e.employeeId)).toEqual([ids.employee])
    expect(after.vehicles.map((v) => v.vehicleId)).toEqual([ids.vehicle])
    await runTool('cancel_schedule_entry', { entryId: entry.id }, as('admin'))
    expect((await prisma.scheduleEntry.findUniqueOrThrow({ where: { id: entry.id } })).cancelledAt).not.toBeNull()
    await expect(runTool('move_schedule_entry', { entryId: entry.id, date: '2031-03-05' }, as('admin'))).rejects.toThrow('No such schedule entry')
  })
})
