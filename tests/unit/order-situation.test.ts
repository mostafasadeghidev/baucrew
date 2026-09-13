import { describe, expect, it } from 'vitest'
import {
  certaintyOf,
  certaintyTotals,
  classTotals,
  crewLoadByMonth,
  crewUsage,
  monthSituations,
  monthlyAverage,
  openMoneyOf,
  securedOf,
  situationSummary,
  weeklyTurnover,
} from '@/lib/order-situation'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

const line = (id: string, price: number | null, status?: string, fromSheet = false) => ({
  key: `line-${id}`,
  id,
  name: `Musterbaustelle ${id}`,
  customer: 'Muster GmbH',
  price,
  ...(status ? { status } : {}),
  ...(fromSheet ? { fromSheet: true } : {}),
})

describe('certaintyOf', () => {
  it('reads how far a project’s money has come from its status', () => {
    expect(certaintyOf('PAID')).toBe('paid')
    expect(certaintyOf('INVOICED')).toBe('invoiced')
    expect(certaintyOf('COMPLETED')).toBe('done')
    expect(['APPROVED', 'PLANNED', 'IN_PROGRESS'].map((s) => certaintyOf(s))).toEqual(['ordered', 'ordered', 'ordered'])
    expect(['LEAD', 'QUOTED'].map((s) => certaintyOf(s))).toEqual(['offered', 'offered'])
  })

  it('leaves a line without a project, or with a cancelled one, standing in the sheet alone', () => {
    expect(certaintyOf(undefined)).toBe('sheet')
    expect(certaintyOf('CANCELLED')).toBe('sheet')
  })

  it('counts finished work from before the history cutoff as settled, with what is paid', () => {
    expect(certaintyOf('COMPLETED', true)).toBe('paid')
    expect(certaintyOf('INVOICED', true)).toBe('paid')
  })

  it('does not settle work that is not finished, whatever its dates', () => {
    expect(certaintyOf('PLANNED', true)).toBe('ordered')
    expect(certaintyOf('QUOTED', true)).toBe('offered')
  })
})

describe('certaintyTotals', () => {
  it('adds each line to where its money stands, a sheet line whatever status it carries', () => {
    const totals = certaintyTotals([
      line('a', 10_000, 'PAID'),
      line('b', 4_000, 'COMPLETED'),
      line('c', 6_000, 'PLANNED'),
      line('d', 2_500, 'QUOTED'),
      line('e', 3_000, 'PAID', true),
      line('f', null, 'INVOICED'),
    ])
    expect(totals).toEqual({ paid: 10_000, invoiced: 0, done: 4_000, ordered: 6_000, offered: 2_500, sheet: 3_000 })
    expect(securedOf(totals)).toBe(20_000)
  })

  it('puts the lines of old, settled work with what is paid — but a sheet line stays in the sheet', () => {
    const totals = certaintyTotals([
      { ...line('g', 5_000, 'COMPLETED'), settled: true },
      { ...line('h', 1_500, 'INVOICED'), settled: true },
      { ...line('i', 700, 'COMPLETED', true), settled: true },
    ])
    expect(totals).toMatchObject({ paid: 6_500, done: 0, invoiced: 0, sheet: 700 })
  })
})

describe('classTotals', () => {
  it('folds paid, billed and finished into one class, and still adds up to the same sum', () => {
    const totals = { paid: 10_000, invoiced: 1_000, done: 4_000, ordered: 6_000, offered: 2_500, sheet: 3_000 }
    const classes = classTotals(totals)
    expect(classes).toEqual({ finished: 15_000, ordered: 6_000, offered: 2_500, sheet: 3_000 })
    const sum = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0)
    expect(sum(classes)).toBe(sum(totals))
  })

  it('keeps a correction below zero in its class', () => {
    expect(classTotals({ paid: 0, invoiced: 0, done: -500, ordered: 0, offered: 0, sheet: 0 }).finished).toBe(-500)
  })
})

describe('crewLoadByMonth', () => {
  // September 2026 has 22 weekdays.
  const bookings = [
    { employeeId: 'm1', date: d('2026-09-01') },
    { employeeId: 'm1', date: d('2026-09-01') }, // two sites on one day: one person-day
    { employeeId: 'm1', date: d('2026-09-02') },
    { employeeId: 'm1', date: d('2026-09-05') }, // a Saturday: not a day there was to plan
    { employeeId: 'm2', date: d('2026-09-01') },
    { employeeId: 'm2', date: d('2025-09-01') }, // another year
  ]

  it('counts a person on a working day once, against every weekday of the crew', () => {
    expect(crewLoadByMonth(2026, bookings, [])[8]).toEqual({ booked: 3, available: 44, pct: 7 })
  })

  it('takes the days somebody is away off both sides, each day once, inside the month only', () => {
    const away = [
      { employeeId: 'm2', startDate: d('2026-08-31'), endDate: d('2026-09-04') }, // four weekdays in September
      { employeeId: 'm2', startDate: d('2026-09-03'), endDate: d('2026-09-04') }, // overlapping: the same two days
      { employeeId: 'office', startDate: d('2026-09-01'), endDate: d('2026-09-30') }, // not crew
    ]
    // m2's day on the schedule falls in the holiday, so it is not counted as planned either.
    expect(crewLoadByMonth(2026, bookings, away)[8]).toEqual({ booked: 2, available: 40, pct: 5 })
  })

  it('never goes past everything there was to plan', () => {
    const everyDay = Array.from({ length: 28 }, (_, i) => ({ employeeId: 'm1', date: new Date(Date.UTC(2026, 1, i + 1)) }))
    expect(crewLoadByMonth(2026, everyDay, [])[1]).toEqual({ booked: 20, available: 20, pct: 100 })
  })

  it('has nothing to plan in a year nobody stands on the schedule', () => {
    expect(crewLoadByMonth(2026, [], [])[0]).toEqual({ booked: 0, available: 0, pct: null })
  })
})

describe('weeklyTurnover', () => {
  it('spreads the twelve months before the running one over their weeks', () => {
    const thisYear = Array(12).fill(10_000)
    const lastYear = Array(12).fill(30_000)
    // Running September: January–August this year, September–December last year.
    expect(weeklyTurnover(thisYear, lastYear, 8)).toBeCloseTo((8 * 10_000 + 4 * 30_000) / 52)
  })

  it('makes do with this year alone', () => {
    expect(weeklyTurnover([13_000, 13_000], null, 2)).toBeCloseTo(26_000 / ((2 * 52) / 12))
  })

  it('leaves out the empty months before the figures began', () => {
    const lastYear = Array(12).fill(0)
    const thisYear = [0, 0, 12_000, 12_000, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(weeklyTurnover(thisYear, lastYear, 4)).toBeCloseTo(24_000 / ((2 * 52) / 12))
  })

  it('gives up with nothing to go on', () => {
    expect(weeklyTurnover([0, 0], null, 2)).toBeNull()
    expect(weeklyTurnover([5_000], null, 0)).toBeNull()
  })
})

describe('monthlyAverage', () => {
  it('is what an ordinary month of those twelve brings', () => {
    const thisYear = Array(12).fill(10_000)
    const lastYear = Array(12).fill(30_000)
    expect(monthlyAverage(thisYear, lastYear, 8)).toBeCloseTo((8 * 10_000 + 4 * 30_000) / 12)
  })

  it('leaves out the empty months before the figures began, and gives up without any', () => {
    expect(monthlyAverage([0, 0, 12_000, 6_000], null, 4)).toBeCloseTo(9_000)
    expect(monthlyAverage([0, 0], null, 2)).toBeNull()
  })
})

describe('monthSituations', () => {
  const months = [
    {
      month: 8,
      own: [line('a', 10_000, 'IN_PROGRESS'), line('s1', 5_000, undefined, true)],
      sub: [line('b', 4_000, 'QUOTED')],
    },
    { month: 9, own: [line('c', 9_000, 'APPROVED')], sub: [] },
  ]
  const offer = (id: string, plannedStart: Date | null) => ({
    id,
    name: `Angebot ${id}`,
    customer: 'Beispiel AG',
    price: 7_000,
    ageDays: 12,
    plannedStart,
  })

  it('splits the month, keeps each line with its certainty, and a sheet line with no project to open', () => {
    const [september] = monthSituations({ year: 2026, months, lastYear: null, crew: null, offers: [] })
    expect(september.total).toBe(19_000)
    expect(september.totals).toMatchObject({ ordered: 10_000, sheet: 5_000, offered: 4_000 })
    expect(september.lines.find((l) => l.key === 'line-s1')).toMatchObject({ id: null, certainty: 'sheet' })
  })

  it('lists the offers planned for the month that are not a line of the year yet', () => {
    const [september] = monthSituations({
      year: 2026,
      months,
      lastYear: Array(12).fill(1_000),
      crew: null,
      offers: [
        offer('b', d('2026-09-10')), // a line of September
        offer('c', d('2026-09-20')), // planned for September, but a line of October
        offer('n', d('2026-09-22')),
        offer('x', d('2025-09-20')),
        offer('y', null),
      ],
    })
    expect(september.offers.map((o) => o.id)).toEqual(['n'])
    expect(september.lastYear).toBe(1_000)
  })
})

describe('situationSummary', () => {
  const months = monthSituations({
    year: 2026,
    months: [
      { month: 7, own: [line('a', 20_000, 'PAID'), line('b', 5_000, 'PLANNED')], sub: [] },
      { month: 8, own: [line('c', 30_000, 'IN_PROGRESS'), line('d', 8_000, 'QUOTED')], sub: [] },
      { month: 9, own: [line('e', 12_000, 'APPROVED'), line('f', 6_000, undefined, true)], sub: [] },
    ],
    lastYear: null,
    crew: null,
    offers: [],
  })

  it('adds up what is sure and what is not', () => {
    expect(situationSummary(months, 8, null)).toMatchObject({ total: 81_000, secured: 67_000, unsure: 14_000 })
  })

  it('counts the ordered work from the running month on as the backlog, in ordinary weeks', () => {
    expect(situationSummary(months, 8, 7_000)).toMatchObject({ backlog: 42_000, weeks: 6 })
  })

  it('runs the backlog twelve months, into the next year up to the running month', () => {
    const nextYear = Array(12).fill(1_000)
    expect(situationSummary(months, 8, 7_000, nextYear)).toMatchObject({ backlog: 50_000, weeks: 7 })
  })

  it('has no backlog outside the running year', () => {
    expect(situationSummary(months, -1, 7_000)).toMatchObject({ backlog: null, weeks: null })
  })
})

describe('openMoneyOf', () => {
  const project = (id: string, status: string, actualEnd: Date | null, amount: number | null) => ({
    id,
    number: `2041-${id}`,
    name: `Musterprojekt ${id}`,
    customer: 'Muster GmbH',
    amount,
    status,
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd,
    sourceCreatedAt: null,
  })

  it('keeps finished and billed work in totals of their own, oldest first, and nothing else', () => {
    const open = openMoneyOf(
      [
        project('a', 'COMPLETED', d('2026-09-20'), 4_000),
        project('b', 'COMPLETED', d('2026-09-05'), 6_000),
        project('c', 'INVOICED', null, 2_500),
        project('p', 'PAID', d('2026-09-10'), 9_000),
        project('r', 'IN_PROGRESS', null, 1_000),
      ],
      null
    )
    expect(open.done.total).toBe(10_000)
    expect(open.done.rows.map((r) => r.id)).toEqual(['b', 'a'])
    expect(open.invoiced).toEqual({ total: 2_500, rows: [expect.objectContaining({ id: 'c', since: null })] })
  })

  it('leaves out old data finished before the cutoff, and keeps work with no date', () => {
    const open = openMoneyOf(
      [
        project('old', 'COMPLETED', d('2026-08-31'), 5_000),
        project('new', 'COMPLETED', d('2026-09-01'), 3_000),
        project('undated', 'COMPLETED', null, 1_000),
      ],
      d('2026-09-01')
    )
    expect(open.done.rows.map((r) => r.id)).toEqual(['new', 'undated'])
    expect(open.done.total).toBe(4_000)
  })
})

describe('crewUsage', () => {
  // August 2026 has 21 weekdays; September 22.
  const bookings = [
    { employeeId: 'm1', date: d('2026-08-03') },
    { employeeId: 'm1', date: d('2026-08-03') }, // two sites on one day
    { employeeId: 'm1', date: d('2026-08-08') }, // a Saturday
    { employeeId: 'm1', date: d('2026-08-04') },
    { employeeId: 'm2', date: d('2026-08-05') }, // during a holiday
    { employeeId: 'm2', date: d('2026-08-06') },
  ]
  const absences = [{ employeeId: 'm2', startDate: d('2026-08-05'), endDate: d('2026-08-07') }] // three weekdays
  const vehicles = [
    { vehicleId: 'v1', date: d('2026-08-03') },
    { vehicleId: 'v1', date: d('2026-08-03') },
  ]

  it('counts a person once a weekday, never on a day away, against the weekdays there were', () => {
    const usage = crewUsage(2026, [7, 8], bookings, absences, vehicles)
    expect(usage.covered).toEqual([7])
    expect(usage.people).toEqual([
      { id: 'm1', booked: 2, available: 21, pct: 10 },
      { id: 'm2', booked: 0, available: 18, pct: 0 },
    ])
    expect(usage.vehicles).toEqual([{ id: 'v1', booked: 1, available: 21, pct: 5 }])
  })

  it('holds people against the months people are booked in, and vehicles against theirs', () => {
    const vanInSeptember = [...vehicles, { vehicleId: 'v1', date: d('2026-09-01') }]
    const usage = crewUsage(2026, [7, 8], bookings, absences, vanInSeptember)
    expect(usage.covered).toEqual([7])
    expect(usage.people[0]).toEqual({ id: 'm1', booked: 2, available: 21, pct: 10 })
    // August's 21 weekdays and September's 22.
    expect(usage.vehicles).toEqual([{ id: 'v1', booked: 2, available: 43, pct: 5 }])
  })

  it('covers only the months of the period that anyone was booked in', () => {
    const usage = crewUsage(2026, [8], bookings, absences, vehicles)
    expect(usage).toEqual({ covered: [], people: [], vehicles: [] })
  })
})
