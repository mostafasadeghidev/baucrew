// DB-backed: runs against the dev database (npm run test:db).
// Verifies the Monatsplanumsatz split and usage counting on real data shapes.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const TAG = 'vitest-reports'
let customerId = ''
const projectIds: string[] = []

beforeAll(async () => {
  const c = await prisma.customer.create({ data: { name: `${TAG} Kunde` } })
  customerId = c.id
  const year = 2031 // far-future year so it never mixes with real data
  const mk = (n: string, price: number, isSub: boolean, month: number) =>
    prisma.project.create({
      data: {
        number: `${year}-${n}`,
        name: `${TAG} ${n}`,
        customerId,
        price,
        isSub,
        status: 'PLANNED',
        plannedStart: new Date(Date.UTC(year, month, 5)),
      },
    })
  const created = await Promise.all([
    mk('9001', 1000, false, 0), // Jan own
    mk('9002', 250, false, 0), // Jan own
    mk('9003', 400, true, 0), // Jan SUB
    mk('9004', 99, false, 3), // Apr own
  ])
  projectIds.push(...created.map((p) => p.id))
  // cancelled projects must be excluded
  const cancelled = await prisma.project.create({
    data: {
      number: `${year}-9005`,
      name: `${TAG} cancelled`,
      customerId,
      price: 5000,
      status: 'CANCELLED',
      plannedStart: new Date(Date.UTC(year, 0, 6)),
    },
  })
  projectIds.push(cancelled.id)
})

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } })
  await prisma.customer.delete({ where: { id: customerId } })
  await prisma.$disconnect()
})

describe('getYearRevenue', () => {
  it('splits own crew vs SUB per month and excludes cancelled projects', async () => {
    const { getYearRevenue } = await import('@/lib/reports')
    const r = await getYearRevenue(2031)
    const jan = r.months[0]
    expect(jan.ownTotal).toBe(1250)
    expect(jan.subTotal).toBe(400)
    expect(jan.total).toBe(1650)
    expect(jan.own.map((p) => p.number).sort()).toEqual(['2031-9001', '2031-9002'])
    expect(jan.sub.map((p) => p.number)).toEqual(['2031-9003'])
    expect(r.months[3].ownTotal).toBe(99)
    expect(r.yearTotal).toBe(1749)
    // cancelled 5000 must not appear anywhere
    expect(r.months.flatMap((m) => [...m.own, ...m.sub]).some((p) => p.number === '2031-9005')).toBe(false)
  })
})

describe('getYearRevenue with a planning sheet', () => {
  const year = 2032
  const ids: string[] = []
  let cust = ''
  let tied = ''
  let beside = ''

  beforeAll(async () => {
    const c = await prisma.customer.create({ data: { name: `${TAG} Kunde 2032` } })
    cust = c.id
    const p1 = await prisma.project.create({
      data: {
        number: `${year}-9101`,
        name: `${TAG} tied`,
        customerId: cust,
        price: 1234,
        status: 'PLANNED',
        plannedStart: new Date(Date.UTC(year, 0, 5)),
      },
    })
    const p2 = await prisma.project.create({
      data: {
        number: `${year}-9102`,
        name: `${TAG} beside`,
        customerId: cust,
        price: 700,
        status: 'PLANNED',
        plannedStart: new Date(Date.UTC(year, 1, 5)),
      },
    })
    ids.push(p1.id, p2.id)
    tied = p1.id
    beside = p2.id
    await prisma.planEntry.createMany({
      data: [
        { year, month: 1, name: `${TAG} Musterhof Innenputz`, amount: 1000, isSub: false, source: TAG, projectId: p1.id },
        { year, month: 1, name: `${TAG} Beispielweg`, amount: 500, isSub: false, source: TAG },
        { year, month: 1, name: `${TAG} Musterhalle`, amount: 300, isSub: true, source: TAG },
      ],
    })
  })

  afterAll(async () => {
    await prisma.planEntry.deleteMany({ where: { year, source: TAG } })
    await prisma.project.deleteMany({ where: { id: { in: ids } } })
    await prisma.customer.delete({ where: { id: cust } })
  })

  it('reads the months from the sheet and lists the projects the sheet does not know beside them', async () => {
    const { getYearRevenue } = await import('@/lib/reports')
    const r = await getYearRevenue(year)
    expect(r.sheetLed).toBe(true)
    expect(r.fromSheet).toBe(false)
    const jan = r.months[0]
    // The sheet's amounts, not the project's price.
    expect(jan.ownTotal).toBe(1500)
    expect(jan.subTotal).toBe(300)
    expect(jan.total).toBe(1800)
    expect(jan.own.find((p) => p.id === tied)?.name).toBe(`${TAG} Musterhof Innenputz`)
    expect(jan.own.find((p) => p.fromSheet)?.name).toBe(`${TAG} Beispielweg`)
    expect(jan.extra).toEqual([])
    // The project without a line stands beside February, uncounted.
    const feb = r.months[1]
    expect(feb.total).toBe(0)
    expect(feb.extra.map((p) => p.id)).toEqual([beside])
    expect(feb.extraTotal).toBe(700)
    expect(r.yearTotal).toBe(1800)
    expect(r.undated).toEqual([])
  })
})
