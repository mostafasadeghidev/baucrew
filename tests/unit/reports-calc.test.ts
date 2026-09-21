import { describe, expect, it } from 'vitest'
import {
  businessDaysBetween,
  computeEfficiency,
  cumulativeMonths,
  customerTotals,
  daysDiff,
  heatLevel,
  lostCustomers,
  monthSiteCount,
  parseCompareYears,
  carryCompareYears,
  compareTones,
  yearsWithData,
  percentChange,
  planReached,
  siteMonthRows,
  splitPlanGaps,
  sumThroughMonth,
  topSites,
} from '@/lib/reports-calc'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe('businessDaysBetween', () => {
  it('counts Mon–Fri inclusive', () => {
    // 2026-08-10 (Mon) .. 2026-08-14 (Fri) = 5; through Sun 16 still 5
    expect(businessDaysBetween(d('2026-08-10'), d('2026-08-14'))).toBe(5)
    expect(businessDaysBetween(d('2026-08-10'), d('2026-08-16'))).toBe(5)
    expect(businessDaysBetween(d('2026-08-10'), d('2026-08-17'))).toBe(6)
  })
  it('returns null for missing or inverted ranges', () => {
    expect(businessDaysBetween(null, d('2026-08-14'))).toBeNull()
    expect(businessDaysBetween(d('2026-08-14'), d('2026-08-10'))).toBeNull()
  })
})

describe('daysDiff', () => {
  it('is positive when b is after a', () => {
    expect(daysDiff(d('2026-08-10'), d('2026-08-14'))).toBe(4)
    expect(daysDiff(d('2026-08-14'), d('2026-08-10'))).toBe(-4)
    expect(daysDiff(null, d('2026-08-10'))).toBeNull()
  })
})

describe('computeEfficiency', () => {
  it('derives days, person-days and revenue per person-day', () => {
    const r = computeEfficiency({
      price: 9000,
      plannedStart: d('2026-08-10'),
      plannedEnd: d('2026-08-14'), // 5 planned days
      actualStart: d('2026-08-10'),
      actualEnd: d('2026-08-18'), // 4 days late
      entries: [
        { date: d('2026-08-10'), employeeCount: 3 },
        { date: d('2026-08-11'), employeeCount: 3 },
        { date: d('2026-08-11'), employeeCount: 1 }, // second entry same day → still 1 actual day
        { date: d('2026-08-12'), employeeCount: 2 },
      ],
    })
    expect(r.plannedDays).toBe(5)
    expect(r.actualDays).toBe(3)
    expect(r.personDays).toBe(9)
    expect(r.revenuePerPersonDay).toBe(1000)
    expect(r.delayDays).toBe(4)
    expect(r.dayDelta).toBe(-2)
  })
  it('handles missing price and dates', () => {
    const r = computeEfficiency({
      price: null,
      plannedStart: null,
      plannedEnd: null,
      actualStart: null,
      actualEnd: null,
      entries: [],
    })
    expect(r.plannedDays).toBeNull()
    expect(r.revenuePerPersonDay).toBeNull()
    expect(r.delayDays).toBeNull()
    expect(r.dayDelta).toBeNull()
    expect(r.personDays).toBe(0)
  })
})

describe('percentChange / sumThroughMonth', () => {
  it('computes rounded percent change', () => {
    expect(percentChange(112, 100)).toBe(12)
    expect(percentChange(90, 100)).toBe(-10)
    expect(percentChange(50, 0)).toBeNull()
    expect(percentChange(50, null)).toBeNull()
  })
  it('sums months up to and including the given month', () => {
    const m = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    expect(sumThroughMonth(m, 0)).toBe(1)
    expect(sumThroughMonth(m, 2)).toBe(6)
    expect(sumThroughMonth(m, 11)).toBe(78)
    expect(sumThroughMonth(m, 99)).toBe(78)
  })
})

describe('period helpers', () => {
  it('parses month, quarter and half-year', async () => {
    const { parsePeriod, sumRange, workingDaysInPeriod, utilizationLevel } = await import('@/lib/reports-calc')
    expect(parsePeriod('')).toBeNull()
    expect(parsePeriod('8')).toEqual({ from: 7, to: 7 })
    expect(parsePeriod('12')).toEqual({ from: 11, to: 11 })
    expect(parsePeriod('q3')).toEqual({ from: 6, to: 8 })
    expect(parsePeriod('H2')).toEqual({ from: 6, to: 11 })
    expect(parsePeriod('13')).toBeNull()
    expect(parsePeriod('q5')).toBeNull()
    const m = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    expect(sumRange(m, null)).toBe(78)
    expect(sumRange(m, { from: 6, to: 8 })).toBe(24)
    // Q1 2026 fully in the past: Jan 22 + Feb 20 + Mar 22 working days = 64
    expect(workingDaysInPeriod(2026, { from: 0, to: 2 }, d('2026-08-15'))).toBe(64)
    // running month capped at today: Aug 1..15 2026 → 10 working days
    expect(workingDaysInPeriod(2026, { from: 7, to: 7 }, d('2026-08-15'))).toBe(10)
    // future period → 0
    expect(workingDaysInPeriod(2026, { from: 10, to: 11 }, d('2026-08-15'))).toBe(0)
    expect(utilizationLevel(30)).toBe('low')
    expect(utilizationLevel(70)).toBe('normal')
    expect(utilizationLevel(95)).toBe('high')
    expect(utilizationLevel(null)).toBeNull()
  })
})

describe('plan lines without a project', () => {
  const rows = [{ month: 1 }, { month: 8 }, { month: 9 }, { month: 12 }, { month: null }]
  const today = new Date(Date.UTC(2026, 8, 7)) // September 2026

  it('separates what is still ahead from what is behind', () => {
    const { upcoming, past } = splitPlanGaps(rows, 2026, today)
    expect(upcoming.map((r) => r.month)).toEqual([9, 12, null])
    expect(past.map((r) => r.month)).toEqual([1, 8])
  })

  it('leaves a past year entirely behind', () => {
    const { upcoming, past } = splitPlanGaps(rows, 2025, today)
    expect(upcoming).toEqual([])
    expect(past).toHaveLength(rows.length)
  })

  it('has a coming year entirely ahead', () => {
    const { upcoming, past } = splitPlanGaps(rows, 2027, today)
    expect(upcoming).toHaveLength(rows.length)
    expect(past).toEqual([])
  })
})

const site = (id: string, name: string, price: number | null, fromSheet = false) => ({
  id,
  number: fromSheet ? '' : `2041-${id}`,
  name,
  customer: fromSheet ? '' : 'Muster GmbH',
  price,
  ...(fromSheet ? { fromSheet: true } : {}),
})

describe('topSites', () => {
  const months = [
    { month: 0, own: [site('a', 'Musterhof', 30_000), site('b', 'Beispielweg 3', 5_000)], sub: [] },
    { month: 1, own: [site('a', 'Musterhof', 20_000)], sub: [site('c', 'Musterstraße 7', 8_000)] },
    { month: 2, own: [], sub: [] },
  ]

  it('folds a project spread over months into one line, biggest first', () => {
    const rows = topSites(months as never, null)
    expect(rows.map((r) => [r.name, r.total, r.lines])).toEqual([
      ['Musterhof', 50_000, 2],
      ['Musterstraße 7', 8_000, 1],
      ['Beispielweg 3', 5_000, 1],
    ])
    expect(rows[0].id).toBe('a')
  })

  it('honours the period', () => {
    expect(topSites(months as never, { from: 1, to: 2 }).map((r) => [r.name, r.total])).toEqual([
      ['Musterhof', 20_000],
      ['Musterstraße 7', 8_000],
    ])
  })

  it('folds sheet-only lines by name, and gives them no project to open', () => {
    const rows = topSites(
      [
        { month: 0, own: [site('l1', ' Musterbau ', 10_000, true)], sub: [] },
        { month: 1, own: [site('l2', 'musterbau', 4_000, true)], sub: [] },
      ] as never,
      null
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].total).toBe(14_000)
    expect(rows[0].id).toBeNull()
  })

  it('keeps a line without an amount instead of dropping it', () => {
    const rows = topSites([{ month: 0, own: [site('x', 'Ohne Wert', null)], sub: [] }] as never, null)
    expect(rows).toEqual([
      expect.objectContaining({ name: 'Ohne Wert', total: 0, lines: 1 }),
    ])
  })
})

describe('siteMonthRows', () => {
  const months = [
    { month: 0, own: [site('a', 'Musterhof', 30_000)], sub: [] },
    {
      month: 1,
      own: [site('a', 'Musterhof', 20_000), site('b', 'Beispielweg 3', 5_000)],
      sub: [site('c', 'Musterstraße 7', 8_000)],
    },
    { month: 2, own: [], sub: [site('b', 'Beispielweg 3', 2_000)] },
  ]

  it('gives every site its months, split by who did the work', () => {
    const b = siteMonthRows(months as never, [0, 1, 2]).find((r) => r.name === 'Beispielweg 3')
    expect(b?.cells).toEqual({ 1: { own: 5_000, sub: 0 }, 2: { own: 0, sub: 2_000 } })
    expect(b?.total).toBe(7_000)
    expect(b?.span).toEqual([1, 2])
  })

  it('reads as a staircase: by the first month, then the bigger site first', () => {
    expect(siteMonthRows(months as never, [0, 1, 2]).map((r) => r.name)).toEqual([
      'Musterhof',
      'Musterstraße 7',
      'Beispielweg 3',
    ])
  })

  it('follows the order the months are shown in, and counts only those', () => {
    expect(siteMonthRows(months as never, [2, 1]).map((r) => [r.name, r.span, r.total])).toEqual([
      ['Beispielweg 3', [2, 1], 7_000],
      ['Musterhof', [1], 20_000],
      ['Musterstraße 7', [1], 8_000],
    ])
  })

  it('folds sheet-only lines by name, and gives them no project to open', () => {
    const rows = siteMonthRows(
      [
        { month: 3, own: [site('l1', ' Musterbau ', 10_000, true)], sub: [] },
        { month: 4, own: [site('l2', 'musterbau', 4_000, true)], sub: [] },
      ] as never,
      [3, 4]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: null, total: 14_000, span: [3, 4] })
  })

  it('agrees with topSites on what one site is', () => {
    const matrix = siteMonthRows(months as never, [0, 1, 2]).map((r) => r.key).sort()
    expect(matrix).toEqual(topSites(months as never, null).map((s) => s.key).sort())
  })
})

describe('monthSiteCount', () => {
  it('counts a site once, however many lines it has and in whichever lane', () => {
    expect(
      monthSiteCount({
        own: [site('a', 'Musterhof', 1_000), site('a', 'Musterhof', 2_000)],
        sub: [site('a', 'Musterhof', 3_000)],
      } as never)
    ).toBe(1)
  })

  it('takes two sheet lines of one name for one site, and two names for two', () => {
    expect(
      monthSiteCount({ own: [site('l1', ' Musterbau ', 1, true)], sub: [site('l2', 'musterbau', 2, true)] } as never)
    ).toBe(1)
    expect(
      monthSiteCount({ own: [site('l1', 'Musterbau', 1, true), site('l2', 'Beispielhaus', 1, true)], sub: [] } as never)
    ).toBe(2)
  })
})

describe('heatLevel', () => {
  it('shades the biggest cell darkest, and nothing for nothing', () => {
    expect(heatLevel(50_000, 50_000, 4)).toBe(3)
    expect(heatLevel(0, 50_000, 4)).toBe(0)
    expect(heatLevel(-100, 50_000, 4)).toBe(0)
  })

  it('lifts a small cell by the square root of its share', () => {
    // A quarter of the biggest is half-way up the scale, not a quarter of the way.
    expect(heatLevel(12_500, 50_000, 4)).toBe(2)
    expect(heatLevel(1_000, 50_000, 4)).toBe(0)
  })

  it('never goes past the last step', () => {
    expect(heatLevel(80_000, 50_000, 4)).toBe(3)
  })
})

describe('planReached', () => {
  const euros = (v: number) => `${Math.round(v)} €`
  const cents = (v: number) => `${v.toFixed(2)} €`

  it('reaches the plan at the plan and above it', () => {
    expect(planReached(10_000, 10_000, cents)).toEqual({ reached: true, diff: 0, label: '+0.00 €' })
    expect(planReached(10_500, 10_000, euros)).toMatchObject({ reached: true, label: '+500 €' })
  })

  it('counts a shortfall too small for the figures it is written in as reached', () => {
    expect(planReached(9_999.6, 10_000, euros)).toMatchObject({ reached: true, label: '+0 €' })
    expect(planReached(9_999.6, 10_000, cents)).toMatchObject({ reached: false, label: '−0.40 €' })
    expect(planReached(0.3, 0.1 + 0.2, cents)).toMatchObject({ reached: true, label: '+0.00 €' })
  })

  it('falls short where the figures show it', () => {
    expect(planReached(9_000, 10_000, euros)).toMatchObject({ reached: false, diff: -1_000, label: '−1000 €' })
  })
})

describe('cumulativeMonths', () => {
  const months = Array.from({ length: 12 }, (_, month) => ({ month, total: (month + 1) * 1_000 }))
  const previous = Array.from({ length: 12 }, (_, month) => ({ month, total: 500 }))

  it('adds up as the year goes and compares with the year before', () => {
    const rows = cumulativeMonths(months, previous, null)
    expect(rows).toHaveLength(12)
    expect(rows[0]).toEqual({ month: 0, total: 1_000, running: 1_000, prevRunning: 500, delta: 500 })
    expect(rows[11].running).toBe(78_000)
    expect(rows[11].prevRunning).toBe(6_000)
    expect(rows[11].delta).toBe(72_000)
  })

  it('starts counting at the first month of the period, not of the year', () => {
    const rows = cumulativeMonths(months, previous, { from: 3, to: 5 })
    expect(rows.map((r) => r.month)).toEqual([3, 4, 5])
    expect(rows[0].running).toBe(4_000)
    expect(rows[2].running).toBe(15_000)
    expect(rows[2].prevRunning).toBe(1_500)
  })

  it('leaves the comparison empty when the year before is unknown', () => {
    const rows = cumulativeMonths(months, null, { from: 0, to: 1 })
    expect(rows.map((r) => [r.prevRunning, r.delta])).toEqual([
      [null, null],
      [null, null],
    ])
  })
})

describe('parseCompareYears', () => {
  const allowed = [2027, 2026, 2025, 2024, 2023, 2022]

  it('defaults to the year before when nothing was chosen', () => {
    expect(parseCompareYears(undefined, 2026, allowed)).toEqual([2025])
  })

  it('tells "no comparison" apart from "not chosen yet"', () => {
    expect(parseCompareYears('', 2026, allowed)).toEqual([])
    expect(parseCompareYears('   ', 2026, allowed)).toEqual([])
  })

  it('reads a list, newest first, without repeats', () => {
    expect(parseCompareYears('2023,2025,2023,2024', 2026, allowed)).toEqual([2025, 2024, 2023])
  })

  it('drops the year itself, unknown years and rubbish', () => {
    expect(parseCompareYears('2026,2019,abc,2025', 2026, allowed)).toEqual([2025])
  })

  it('caps the list so the months stay readable', () => {
    // Every year the picker offers fits; a sixth would not.
    expect(parseCompareYears('2025,2024,2023,2022,2027', 2026, allowed)).toEqual([
      2027, 2025, 2024, 2023, 2022,
    ])
    expect(parseCompareYears('2025,2024,2023,2022,2027,2021', 2026, [...allowed, 2021])).toEqual([
      2027, 2025, 2024, 2023, 2022,
    ])
    expect(parseCompareYears('2025,2024', 2026, allowed, 1)).toEqual([2025])
  })

  it('offers no comparison when the year before is not on the list', () => {
    expect(parseCompareYears(undefined, 2022, allowed)).toEqual([])
  })
})

describe('yearsWithData', () => {
  const offered = [2027, 2026, 2025, 2024, 2023, 2022]
  const totals = [
    { year: 2027, total: 0 },
    { year: 2026, total: 2400 },
    { year: 2025, total: 2200 },
    { year: 2024, total: 0 },
    { year: 2023, total: 1500 },
  ]

  it('offers the years that have something in them, in the order they were offered', () => {
    expect(yearsWithData(offered, totals)).toEqual([2026, 2025, 2023])
  })

  it('keeps a year that is ticked, or that a card stands on, whatever it holds', () => {
    expect(yearsWithData(offered, totals, [2022, 2027])).toEqual([2027, 2026, 2025, 2023, 2022])
  })

  it('offers nothing where nothing is known', () => {
    expect(yearsWithData(offered, [])).toEqual([])
  })
})

describe('carryCompareYears', () => {
  it('keeps every year of the chart when the page moves to another year', () => {
    // 2026 against 2025 and 2024 becomes 2025 against 2026 and 2024.
    expect(carryCompareYears('2025,2024', 2026, 2025)).toBe('2026,2024')
    // A year that was not in the chart joins it; the old one stays beside it.
    expect(carryCompareYears('2025,2024', 2026, 2023)).toBe('2026,2025,2024')
  })

  it('brings the chart back as it was when the page moves back', () => {
    const there = carryCompareYears('2025,2024', 2026, 2025)
    expect(carryCompareYears(there, 2025, 2026)).toBe('2025,2024')
  })

  it('leaves a comparison nobody chose, and one that was emptied, alone', () => {
    expect(carryCompareYears(undefined, 2026, 2025)).toBeUndefined()
    expect(carryCompareYears('', 2026, 2025)).toBe('')
  })

  it('changes nothing when the year does not change', () => {
    expect(carryCompareYears('2025,2024', 2026, 2026)).toBe('2025,2024')
  })

  it('ignores rubbish and repeats in what it is given', () => {
    expect(carryCompareYears('2025,abc,2025', 2026, 2024)).toBe('2026,2025')
  })
})

describe('compareTones', () => {
  const offered = [2027, 2026, 2025, 2024, 2023, 2022]

  it('gives the year before the first colour and the others theirs newest first', () => {
    const tones = compareTones(2026, offered)
    expect([...tones]).toEqual([
      [2025, 0],
      [2027, 1],
      [2024, 2],
      [2023, 3],
      [2022, 4],
    ])
    expect(tones.has(2026)).toBe(false)
  })

  it('goes newest first where the year before is not on offer', () => {
    expect([...compareTones(2022, offered)].slice(0, 2)).toEqual([
      [2027, 0],
      [2026, 1],
    ])
  })
})

describe('customerTotals', () => {
  const line = (id: string, customerId: string | null, customer: string, price: number, fromSheet = false) => ({
    id,
    customerId,
    customer,
    price,
    ...(fromSheet ? { fromSheet: true } : {}),
  })
  const months = [
    { month: 0, own: [line('a', 'c1', 'Muster GmbH', 30_000), line('b', 'c2', 'Beispiel AG', 10_000)], sub: [] },
    { month: 1, own: [line('a', 'c1', 'Muster GmbH', 20_000)], sub: [line('s', null, 'Musterweg', 40_000, true)] },
  ]

  it('splits the same total the months add up to, jobs counted once', () => {
    const { rows, total } = customerTotals(months, null)
    expect(total).toBe(100_000)
    expect(rows).toEqual([
      { id: 'c1', name: 'Muster GmbH', total: 50_000, jobs: 1, share: 50 },
      { id: null, name: '', total: 40_000, jobs: 1, share: 40 },
      { id: 'c2', name: 'Beispiel AG', total: 10_000, jobs: 1, share: 10 },
    ])
  })

  it('honours the period', () => {
    expect(customerTotals(months, { from: 1, to: 1 }).total).toBe(60_000)
  })
})

describe('lostCustomers', () => {
  it('names last year’s customers with nothing this year, the biggest first', () => {
    const row = (id: string | null, total: number) => ({ id, name: id ?? '', total, jobs: 1, share: 0 })
    expect(
      lostCustomers([row('c1', 5_000)], [row('c1', 1_000), row('c2', 2_000), row('c3', 9_000), row(null, 50_000)]).map(
        (r) => r.id
      )
    ).toEqual(['c3', 'c2'])
  })
})
