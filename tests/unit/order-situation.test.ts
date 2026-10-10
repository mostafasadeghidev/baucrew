import { describe, expect, it } from 'vitest'
import {
  certaintyOf,
  certaintyTotals,
  classTotals,
  crewUsage,
  monthSituations,
  monthlyAverage,
  openMoneyOf,
  orderedLines,
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

describe('orderedLines', () => {
  it('keeps the ordered, planned and running work, the biggest first, and adds up to the ordered total', () => {
    const lines = [
      line('a', 4_000, 'APPROVED'),
      line('b', 9_000, 'IN_PROGRESS'),
      line('c', null, 'PLANNED'),
      line('d', 7_000, 'QUOTED'),
      line('e', 8_000, 'PLANNED', true), // a sheet line: only a plan
      line('f', 5_000, 'COMPLETED'),
    ]
    const ordered = orderedLines(lines)
    expect(ordered.map((l) => l.id)).toEqual(['b', 'a', 'c'])
    expect(ordered.reduce((sum, l) => sum + (l.price ?? 0), 0)).toBe(certaintyTotals(lines).ordered)
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
    { employeeId: 'm1', date: d('2026-08-31') }, // the schedule's last day
  ]
  const absences = [{ employeeId: 'm2', startDate: d('2026-08-05'), endDate: d('2026-08-07') }] // three weekdays
  const vehicles = [
    { vehicleId: 'v1', date: d('2026-08-03') },
    { vehicleId: 'v1', date: d('2026-08-03') },
    { vehicleId: 'v1', date: d('2026-08-31') },
  ]
  const year = Array.from({ length: 12 }, (_, i) => i)

  it('counts a person once a weekday, never on a day away, against the weekdays of the written schedule', () => {
    const usage = crewUsage(2026, [7, 8], bookings, absences, vehicles)
    // From Monday 3 to Monday 31 August: 21 weekdays.
    expect(usage.window).toEqual({ start: d('2026-08-03'), end: d('2026-08-31') })
    expect(usage.people).toEqual([
      { id: 'm1', booked: 3, available: 21, pct: 14 },
      { id: 'm2', booked: 0, available: 18, pct: 0 },
    ])
    expect(usage.vehicles).toEqual([{ id: 'v1', booked: 2, available: 21, pct: 10 }])
  })

  it('counts a month the schedule only began in from its first day, not the whole month', () => {
    // Started on Monday 27 July, written to Wednesday 30 September.
    const started = [
      ...['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31'].map((day) => ({ employeeId: 'm1', date: d(day) })),
      { employeeId: 'm1', date: d('2026-09-30') },
    ]
    const usage = crewUsage(2026, year, started, [], [])
    expect(usage.months[6]).toEqual({ booked: 5, available: 5, pct: 100 })
    expect(usage.months[5].pct).toBeNull()
    expect(usage.months[10].pct).toBeNull()
  })

  it('adds the ring up from the rows, and the period’s month bars to the same figure', () => {
    // A works every weekday of the first quarter; B is booked once, in December.
    const q1 = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)))
      .filter((day) => day.getUTCMonth() < 3)
      .map((date) => ({ employeeId: 'a', date }))
    const withB = [...q1, { employeeId: 'b', date: d('2026-12-01') }]
    const usage = crewUsage(2026, [0, 1, 2], withB, [], [])
    expect(usage.people.map((p) => [p.id, p.pct])).toEqual([['a', 100]])
    const bars = usage.months.slice(0, 3)
    const rows = usage.people
    expect(bars.reduce((s, m) => s + m.booked, 0)).toBe(rows.reduce((s, p) => s + p.booked, 0))
    expect(bars.reduce((s, m) => s + m.available, 0)).toBe(rows.reduce((s, p) => s + p.available, 0))
    expect(bars.every((m) => m.pct === 100)).toBe(true)
  })

  it('reads 0 % for a month inside the schedule in which nobody was booked, and for weekend-only bookings', () => {
    const sparse = [
      { employeeId: 'm1', date: d('2026-01-05') },
      { employeeId: 'm1', date: d('2026-03-07') }, // a Saturday
      { employeeId: 'm1', date: d('2026-04-01') },
    ]
    const usage = crewUsage(2026, year, sparse, [], [])
    expect(usage.months[1]).toEqual({ booked: 0, available: 20, pct: 0 })
    expect(usage.months[2].pct).toBe(0)
  })

  it('lists every vehicle of the fleet, an idle one at 0 %', () => {
    const usage = crewUsage(2026, [7], bookings, absences, vehicles, ['v1', 'v2'])
    expect(usage.vehicles).toEqual([
      { id: 'v1', booked: 2, available: 21, pct: 10 },
      { id: 'v2', booked: 0, available: 21, pct: 0 },
    ])
  })

  it('holds vehicles against their own stretch of the schedule, not the crew’s', () => {
    const vanInSeptember = [...vehicles, { vehicleId: 'v1', date: d('2026-09-01') }]
    const usage = crewUsage(2026, [7, 8], bookings, absences, vanInSeptember)
    expect(usage.people[0]).toEqual({ id: 'm1', booked: 3, available: 21, pct: 14 })
    // 3 August to 1 September: 22 weekdays.
    expect(usage.vehicles).toEqual([{ id: 'v1', booked: 3, available: 22, pct: 14 }])
  })

  it('has nothing to count in a period outside the written schedule', () => {
    const usage = crewUsage(2026, [10], bookings, absences, vehicles, ['v1'])
    expect(usage).toMatchObject({ window: null, people: [], vehicles: [] })
    expect(crewUsage(2026, year, [], [], []).months.every((m) => m.pct === null)).toBe(true)
  })
})
