// DB-backed: runs against the database in DATABASE_URL (npm run test:db) —
// a throwaway one, never real data. The search window (⌘K) as different
// users: a site manager finds only the projects they are named on and no
// customers, the office finds everything, and no answer carries a price.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { searchEverything } from '@/lib/global-search-db'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

// Lower-case letters only, so the tag is one word the search can be asked for.
const TAG = `vitestsuche${Date.now().toString(36)}`
const ids = { employee: '', customer: '', managed: '', foreign: '', vehicle: '' }
const users: Record<'manager' | 'siteManager', unknown> = { manager: null, siteManager: null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: keyof typeof users): any => users[who]

beforeAll(async () => {
  const employee = await prisma.employee.create({ data: { firstName: 'Erika', lastName: `${TAG} Müller` } })
  ids.employee = employee.id
  users.manager = await prisma.user.create({
    data: { username: `${TAG}-manager`, passwordHash: 'x', role: 'MANAGER', canViewFinancials: true },
    include: { employee: true },
  })
  users.siteManager = await prisma.user.create({
    data: { username: `${TAG}-site`, passwordHash: 'x', role: 'SITE_MANAGER', employee: { connect: { id: employee.id } } },
    include: { employee: true },
  })
  ids.customer = (await prisma.customer.create({ data: { name: `${TAG} Bäckerei GmbH`, city: 'Musterstadt' } })).id
  const project = (suffix: string, extra: object) =>
    prisma.project.create({
      data: { number: `${TAG}-${suffix}`, name: `${TAG} ${suffix}`, customerId: ids.customer, price: 12000, city: 'Großstadt', ...extra },
      select: { id: true },
    })
  ids.managed = (await project('0048', { managerId: employee.id, status: 'PLANNED' })).id
  ids.foreign = (await project('0049', { status: 'APPROVED' })).id
  ids.vehicle = (await prisma.vehicle.create({ data: { name: `${TAG} Sprinter` } })).id
})

afterAll(async () => {
  const userIds = Object.values(users).map((u) => (u as { id: string }).id)
  await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.customer.deleteMany({ where: { id: ids.customer } })
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await prisma.employee.deleteMany({ where: { id: ids.employee } })
  await prisma.$disconnect()
})

describe('searchEverything', () => {
  it('finds every project and the master data for the office', async () => {
    const found = await searchEverything(as('manager'), TAG)
    expect(found.projects.map((p) => p.id).sort()).toEqual([ids.managed, ids.foreign].sort())
    expect(found.customers.map((c) => c.id)).toEqual([ids.customer])
    expect(found.employees.map((e) => e.id)).toEqual([ids.employee])
    expect(found.vehicles.map((v) => v.id)).toEqual([ids.vehicle])
  })

  it('gives a site manager only their own projects and nothing of the master data', async () => {
    const found = await searchEverything(as('siteManager'), TAG)
    expect(found.projects.map((p) => p.id)).toEqual([ids.managed])
    expect(found.customers).toEqual([])
    expect(found.employees).toEqual([])
    expect(found.vehicles).toEqual([])
    expect(found.devices).toEqual([])
  })

  it('never answers with a price', async () => {
    const found = await searchEverything(as('manager'), TAG)
    expect(JSON.stringify(found)).not.toMatch(/price|12000/)
  })

  it('finds an umlaut written out and a number by its end', async () => {
    expect((await searchEverything(as('manager'), `${TAG} grossstadt`)).projects).toHaveLength(2)
    expect((await searchEverything(as('manager'), `${TAG} baeckerei`)).customers.map((c) => c.id)).toEqual([ids.customer])
    expect((await searchEverything(as('manager'), `${TAG} mueller`)).employees.map((e) => e.id)).toEqual([ids.employee])
    const byNumber = await searchEverything(as('manager'), `${TAG}-0048`)
    expect(byNumber.projects[0].id).toBe(ids.managed)
  })

  it('answers an empty query with nothing', async () => {
    const found = await searchEverything(as('manager'), '   ')
    expect(found.projects).toEqual([])
  })
})
