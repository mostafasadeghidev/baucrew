// DB-backed: runs against the dev database (npm run test:db).
// The per-project actions a site manager reaches from a card: allowed on the
// projects they are named on, refused on any other — and "reopen" brings back
// only the days that were cancelled together with the completion.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const who = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => who.user }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`)
  },
}))

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-sm-actions-${Date.now()}`
const day = (d: number) => new Date(Date.UTC(2034, 2, d))
let employeeId = ''
let userId = ''
let managed = ''
let foreign = ''

beforeAll(async () => {
  const employee = await prisma.employee.create({ data: { firstName: 'Erika', lastName: TAG } })
  employeeId = employee.id
  const user = await prisma.user.create({ data: { username: TAG, passwordHash: 'x', role: 'SITE_MANAGER', employee: { connect: { id: employeeId } } } })
  userId = user.id
  who.user = { ...user, employee: { id: employeeId, firstName: 'Erika', lastName: TAG } }
  const customer = await prisma.customer.create({ data: { name: `${TAG} Muster GmbH` } })
  const make = (suffix: string, extra: object) =>
    prisma.project.create({ data: { number: `${TAG}-${suffix}`, name: `${TAG} ${suffix}`, customerId: customer.id, ...extra }, select: { id: true } })
  managed = (await make('managed', { managerId: employeeId, status: 'COMPLETED' })).id
  foreign = (await make('foreign', { status: 'COMPLETED' })).id
})

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId } })
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [managed, foreign] } } })
  await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.employee.deleteMany({ where: { id: employeeId } })
  await prisma.$disconnect()
})

describe('a site manager’s checklists', () => {
  it('adds and removes them on their own project, and on no other', async () => {
    const { addProjectChecklist, removeProjectChecklist } = await import('@/app/(admin)/projects/[id]/checklist-actions')
    expect(await addProjectChecklist(foreign, { name: 'Muster Liste' })).toEqual({ error: 'notAllowed' })
    expect(await prisma.projectChecklist.count({ where: { projectId: foreign } })).toBe(0)

    expect((await addProjectChecklist(managed, { name: 'Muster Liste' })).error).toBeUndefined()
    const own = await prisma.projectChecklist.findFirstOrThrow({ where: { projectId: managed } })
    expect((await removeProjectChecklist(own.id)).error).toBeUndefined()

    const theirs = await prisma.projectChecklist.create({ data: { projectId: foreign, name: 'Beispiel Liste' } })
    expect(await removeProjectChecklist(theirs.id)).toEqual({ error: 'notAllowed' })
    expect(await prisma.projectChecklist.count({ where: { id: theirs.id } })).toBe(1)
  })
})

describe('reopening a finished job', () => {
  it('is refused on a project the site manager is not named on', async () => {
    const { reopenProject } = await import('@/app/(admin)/schedule/actions')
    expect(await reopenProject(foreign)).toEqual({ error: 'saveFailed' })
    expect((await prisma.project.findUniqueOrThrow({ where: { id: foreign } })).status).toBe('COMPLETED')
  })

  it('brings back only the days cancelled with the completion, not those taken out by hand', async () => {
    const { reopenProject } = await import('@/app/(admin)/schedule/actions')
    const completedAt = new Date('2034-03-05T10:00:00.000Z')
    const byHandAt = new Date('2034-03-01T08:00:00.000Z')
    await prisma.scheduleEntry.createMany({
      data: [
        { projectId: managed, date: day(3), cancelledAt: byHandAt },
        { projectId: managed, date: day(6), cancelledAt: completedAt },
        { projectId: managed, date: day(7), cancelledAt: completedAt },
      ],
    })
    await prisma.auditLog.create({
      data: { userId, action: 'schedule.cancelLaterDays', entity: 'Project', entityId: managed, newValue: '2 ×', createdAt: completedAt },
    })

    expect(await reopenProject(managed)).toEqual({ restored: 2 })
    const days = await prisma.scheduleEntry.findMany({ where: { projectId: managed }, orderBy: { date: 'asc' }, select: { date: true, cancelledAt: true } })
    expect(days.map((d) => [d.date.getUTCDate(), d.cancelledAt === null])).toEqual([
      [3, false],
      [6, true],
      [7, true],
    ])
    expect((await prisma.project.findUniqueOrThrow({ where: { id: managed } })).status).toBe('PLANNED')
  })

  it('does nothing to a job that is not finished', async () => {
    const { reopenProject } = await import('@/app/(admin)/schedule/actions')
    expect(await reopenProject(managed)).toEqual({ error: 'saveFailed' })
  })
})

describe('the board’s column order', () => {
  it('is the office’s to change', async () => {
    const { setBoardOrder } = await import('@/app/(admin)/projects/actions')
    await expect(setBoardOrder('board_all', [])).rejects.toThrow('redirect /projects')
  })
})
