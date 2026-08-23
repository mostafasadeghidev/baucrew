// DB-backed: runs against the dev database (npm run test:db).
// Follow-on offers ("Nachträge") must raise the order value everywhere.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { orderValue } from '@/lib/reports'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const TAG = 'vitest-addons'
let projectId = ''
let customerId = ''

beforeAll(async () => {
  // A previous aborted run may have left the fixture behind.
  await prisma.project.deleteMany({ where: { number: '2035-9300' } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  const customer = await prisma.customer.create({ data: { name: `${TAG} Kunde` } })
  customerId = customer.id
  const project = await prisma.project.create({
    data: {
      number: '2035-9300',
      name: `${TAG} Projekt`,
      customerId,
      status: 'APPROVED',
      price: 10_000,
      addOns: {
        create: [
          { label: 'Nachtrag 1', amount: 1_500, date: new Date(Date.UTC(2034, 2, 3)) },
          { label: 'Nachtrag 2', amount: 500, date: new Date(Date.UTC(2034, 3, 9)) },
        ],
      },
    },
  })
  projectId = project.id
})

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.customer.deleteMany({ where: { id: customerId } })
  await prisma.$disconnect()
})

describe('follow-on offers', () => {
  it('are stored with the project and add up to the order value', async () => {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { addOns: true },
    })
    expect(project.addOns).toHaveLength(2)
    expect(orderValue(project.price, project.addOns)).toBe(12_000)
  })

  it('count even when the project itself has no price', () => {
    expect(orderValue(null, [{ amount: 800 }])).toBe(800)
    expect(orderValue(null, [])).toBeNull()
    expect(orderValue(5_000, undefined)).toBe(5_000)
  })

  it('disappear with the project (cascade)', async () => {
    await prisma.project.delete({ where: { id: projectId } })
    expect(await prisma.projectAddOn.count({ where: { projectId } })).toBe(0)
    projectId = ''
  })
})
