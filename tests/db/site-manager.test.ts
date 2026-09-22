// DB-backed: runs against the dev database (npm run test:db).
// A site manager sees the projects they are named on — as the site manager or
// in the crew — and nothing else; the office sees every one.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-sitemgr-${Date.now()}`
let employeeId = ''
let userId = ''
let managed = ''
let crewed = ''
let foreign = ''

beforeAll(async () => {
  const employee = await prisma.employee.create({ data: { firstName: 'Erika', lastName: TAG } })
  employeeId = employee.id
  const user = await prisma.user.create({ data: { username: TAG, passwordHash: 'x', role: 'SITE_MANAGER', employee: { connect: { id: employeeId } } } })
  userId = user.id
  const customer = await prisma.customer.create({ data: { name: `${TAG} Muster GmbH` } })
  const make = (suffix: string, extra: object) =>
    prisma.project.create({ data: { number: `${TAG}-${suffix}`, name: `${TAG} ${suffix}`, customerId: customer.id, ...extra }, select: { id: true } })
  managed = (await make('managed', { managerId: employeeId })).id
  crewed = (await make('crewed', { team: { create: [{ employeeId }] } })).id
  foreign = (await make('foreign', {})).id
})

afterAll(async () => {
  await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.employee.deleteMany({ where: { id: employeeId } })
  await prisma.$disconnect()
})

describe('what a site manager sees', () => {
  it('is the projects they are named on, and nothing else', async () => {
    const { canSeeProject, projectScope } = await import('@/lib/project-scope')
    const me = { role: 'SITE_MANAGER', employee: { id: employeeId } }
    const scope = projectScope(me)
    expect(scope).not.toBeNull()
    const seen = await prisma.project.findMany({ where: { AND: [{ name: { startsWith: TAG } }, scope!] }, select: { id: true } })
    expect(seen.map((p) => p.id).sort()).toEqual([managed, crewed].sort())
    expect(await canSeeProject(me, managed)).toBe(true)
    expect(await canSeeProject(me, crewed)).toBe(true)
    expect(await canSeeProject(me, foreign)).toBe(false)
  })

  it('is nothing at all without a person behind the account, and everything for the office', async () => {
    const { canSeeProject, projectScope } = await import('@/lib/project-scope')
    expect(await canSeeProject({ role: 'SITE_MANAGER', employee: null }, managed)).toBe(false)
    expect(projectScope({ role: 'MANAGER', employee: null })).toBeNull()
    expect(await canSeeProject({ role: 'ADMIN', employee: null }, foreign)).toBe(true)
  })

  it('is the same rule the per-project actions go by', async () => {
    const { canWorkOn } = await import('@/lib/crew-access')
    const me = { role: 'SITE_MANAGER', employee: { id: employeeId } }
    expect(await canWorkOn(me, crewed)).toBe(true)
    expect(await canWorkOn(me, foreign)).toBe(false)
    expect(await canWorkOn({ role: 'MANAGER', employee: null }, foreign)).toBe(true)
  })
})
