// DB-backed: runs against the dev database (npm run test:db).
// Guards the "complete project → later days out of the plan → reopen" cycle:
// cancelled days must stay invisible for the board but come back on reopen.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const TAG = 'vitest-cancel'
let projectId = ''
let customerId = ''
const day = (d: number) => new Date(Date.UTC(2033, 4, d))

beforeAll(async () => {
  const customer = await prisma.customer.create({ data: { name: `${TAG} Kunde` } })
  customerId = customer.id
  const project = await prisma.project.create({
    data: {
      number: '2033-9100',
      name: `${TAG} Projekt`,
      customerId,
      status: 'IN_PROGRESS',
      actualStart: day(4),
      scheduleEntries: { create: [{ date: day(4) }, { date: day(5) }, { date: day(6) }, { date: day(7) }] },
    },
  })
  projectId = project.id
})

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.customer.deleteMany({ where: { id: customerId } })
  await prisma.$disconnect()
})

describe('completing a project early', () => {
  it('takes the later days out of the plan without deleting them', async () => {
    const completedOn = day(5)
    const { count } = await prisma.scheduleEntry.updateMany({
      where: { projectId, date: { gt: completedOn }, cancelledAt: null },
      data: { cancelledAt: new Date() },
    })
    expect(count).toBe(2)

    // The board / dashboards only ever read active days.
    const visible = await prisma.scheduleEntry.findMany({
      where: { projectId, cancelledAt: null },
      orderBy: { date: 'asc' },
    })
    expect(visible.map((e) => e.date.toISOString().slice(0, 10))).toEqual(['2033-05-04', '2033-05-05'])

    // …but nothing is lost.
    expect(await prisma.scheduleEntry.count({ where: { projectId } })).toBe(4)
  })

  it('brings the days back when the project is reopened', async () => {
    const { count } = await prisma.scheduleEntry.updateMany({
      where: { projectId, cancelledAt: { not: null } },
      data: { cancelledAt: null },
    })
    expect(count).toBe(2)
    const visible = await prisma.scheduleEntry.count({ where: { projectId, cancelledAt: null } })
    expect(visible).toBe(4)
  })

  it('a cancelled day does not block planning that day again', async () => {
    await prisma.scheduleEntry.updateMany({ where: { projectId, date: day(7) }, data: { cancelledAt: new Date() } })
    const cancelled = await prisma.scheduleEntry.findFirstOrThrow({
      where: { projectId, date: day(7), cancelledAt: { not: null } },
    })
    // The app revives that row instead of inserting a duplicate (unique key).
    const revived = await prisma.scheduleEntry.update({
      where: { id: cancelled.id },
      data: { cancelledAt: null, startTime: '07:00' },
    })
    expect(revived.cancelledAt).toBeNull()
    expect(await prisma.scheduleEntry.count({ where: { projectId } })).toBe(4)
  })
})
