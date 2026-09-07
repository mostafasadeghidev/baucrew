// DB-backed: runs against the dev database (npm run test:db).
// Verifies the Monatsplanumsatz split and usage counting on real data shapes.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

// The data-quality report looks up towns at a public geocoding service.
// Nothing here asserts anything about that, and a test must not depend on
// the internet — so it answers "not found" straight away.
vi.mock('@/lib/geocode', () => ({
  geocodeCity: async () => null,
  searchPlaces: async () => [],
}))

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

describe('old data set aside', () => {
  // A year of its own: a test must never reach into another test's rows.
  const year = 2041
  const NUMBERS = [`${year}-9201`, `${year}-9202`, `${year}-9203`]
  const ids: string[] = []
  let cust = ''
  /** What the installation had set before the test touched it. */
  let previousCutoff: string | null = null

  beforeAll(async () => {
    // A run that broke off earlier must not block this one.
    previousCutoff =
      (await prisma.appSetting.findUnique({ where: { key: 'historyCutoff' } }))?.value ?? null
    // The first test says "while no cutoff is set" — so make that true, and
    // make sure a value left behind by a run that broke off cannot linger.
    await prisma.appSetting.deleteMany({ where: { key: 'historyCutoff' } })
    await prisma.project.deleteMany({ where: { number: { in: NUMBERS } } })
    await prisma.customer.deleteMany({ where: { name: `${TAG} Kunde ${year}`, projects: { none: {} } } })
    const c = await prisma.customer.create({ data: { name: `${TAG} Kunde ${year}` } })
    cust = c.id
    const mk = (n: string, status: 'COMPLETED' | 'PLANNED', actualEnd: Date | null) =>
      prisma.project.create({
        data: {
          number: `${year}-${n}`,
          name: `${TAG} ${n}`,
          customerId: cust,
          status,
          actualEnd,
          // No planned start: these are the "undated" ones.
          createdAt: new Date(Date.UTC(year, 5, 1)),
        },
      })
    const made = await Promise.all([
      mk('9201', 'COMPLETED', new Date(Date.UTC(year, 0, 31))), // finished, before the cutoff
      mk('9202', 'COMPLETED', new Date(Date.UTC(year, 11, 31))), // finished, after the cutoff
      mk('9203', 'PLANNED', null), // open: never history
    ])
    ids.push(...made.map((p) => p.id))
  })

  afterAll(async () => {
    // Put the installation's own setting back — a test must leave no mark.
    if (previousCutoff === null) {
      await prisma.appSetting.deleteMany({ where: { key: 'historyCutoff' } })
    } else {
      await prisma.appSetting.upsert({
        where: { key: 'historyCutoff' },
        update: { value: previousCutoff },
        create: { key: 'historyCutoff', value: previousCutoff },
      })
    }
    await prisma.project.deleteMany({ where: { number: { in: NUMBERS } } })
    await prisma.customer.deleteMany({ where: { id: cust } })
  })

  it('lists every undated project while no cutoff is set', async () => {
    const { getYearRevenue } = await import('@/lib/reports')
    const r = await getYearRevenue(year)
    expect(r.undated).toHaveLength(3)
    expect(r.undatedHistorical).toBe(0)
  })

  it('leaves out what was finished before the cutoff, and says how many', async () => {
    await prisma.appSetting.upsert({
      where: { key: 'historyCutoff' },
      update: { value: `${year}-07-01` },
      create: { key: 'historyCutoff', value: `${year}-07-01` },
    })
    // getHistoryCutoff is cached per request; a fresh module gives a fresh cache.
    vi.resetModules()
    const { getYearRevenue } = await import('@/lib/reports')
    const r = await getYearRevenue(year)
    expect(r.undated.map((p) => p.number).sort()).toEqual([`${year}-9202`, `${year}-9203`])
    expect(r.undatedHistorical).toBe(1)
    // The year's own figures are untouched by the cutoff.
    expect(r.yearTotal).toBe(0)
  })
})

describe('what the data-quality report asks for', () => {
  // A year of its own: a test must never reach into another test's rows.
  const year = 2042
  const NUMBERS = ['9301', '9302', '9303', '9304', '9305', '9306'].map((n) => `${year}-${n}`)
  let cust = ''

  beforeAll(async () => {
    await prisma.project.deleteMany({ where: { number: { in: NUMBERS } } })
    await prisma.customer.deleteMany({ where: { name: `${TAG} Kunde ${year}`, projects: { none: {} } } })
    const c = await prisma.customer.create({ data: { name: `${TAG} Kunde ${year}` } })
    cust = c.id
    const mk = (n: string, status: 'APPROVED' | 'PLANNED' | 'IN_PROGRESS' | 'LEAD', city: string | null = 'Musterstadt') =>
      prisma.project.create({
        data: { number: `${year}-${n}`, name: `${TAG} ${n}`, customerId: cust, status, city },
      })
    await Promise.all([
      mk('9301', 'APPROVED'),
      mk('9302', 'LEAD'),
      mk('9303', 'PLANNED'),
      mk('9304', 'IN_PROGRESS'),
      mk('9305', 'APPROVED', null),
      mk('9306', 'PLANNED', null),
    ])
  })

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { number: { in: NUMBERS } } })
    await prisma.customer.deleteMany({ where: { id: cust } })
  })

  it('asks for a date where work is planned or under way, not for an offer nobody has scheduled', async () => {
    const { getDataQuality } = await import('@/lib/reports')
    const { issues } = await getDataQuality()
    const listed = new Set(issues.find((i) => i.key === 'noPlannedStart')!.items.map((i) => i.label.split(' — ')[0]))
    expect(listed.has(`${year}-9303`)).toBe(true)
    expect(listed.has(`${year}-9304`)).toBe(true)
    expect(listed.has(`${year}-9301`)).toBe(false)
    expect(listed.has(`${year}-9302`)).toBe(false)
  })

  it('asks for a town where there are days to warn about, not for an offer', async () => {
    const { getDataQuality } = await import('@/lib/reports')
    const { issues } = await getDataQuality()
    const listed = new Set(issues.find((i) => i.key === 'noCity')!.items.map((i) => i.label.split(' — ')[0]))
    expect(listed.has(`${year}-9306`)).toBe(true)
    expect(listed.has(`${year}-9305`)).toBe(false)
  })
})
