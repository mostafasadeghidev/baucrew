import { describe, expect, it } from 'vitest'
import {
  addMonths,
  firstMonth,
  monthCount,
  monthInputValue,
  monthSpan,
  monthsInYear,
  movedTo,
  parseMonthInput,
  spreadAmount,
} from '@/lib/plan-month'

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))
const job = (p: Partial<Parameters<typeof firstMonth>[0]> = {}) => ({
  plannedStart: null,
  plannedEnd: null,
  planMonth: null,
  planMonths: 1,
  ...p,
})

describe('where a job stands', () => {
  it('takes the month of a fixed start over the rough placing, and the placing when no day is fixed', () => {
    expect(firstMonth(job({ plannedStart: day(2026, 10, 15), planMonth: day(2026, 9, 1) }))).toEqual({ year: 2026, month: 10 })
    expect(firstMonth(job({ planMonth: day(2026, 9, 1) }))).toEqual({ year: 2026, month: 9 })
    expect(firstMonth(job())).toBeNull()
  })

  it('runs from a fixed start to a fixed end, else as many months as the office said', () => {
    expect(monthCount(job({ plannedStart: day(2026, 9, 20), plannedEnd: day(2026, 11, 2) }))).toBe(3)
    expect(monthCount(job({ plannedStart: day(2026, 9, 20), plannedEnd: day(2026, 9, 28) }))).toBe(1)
    expect(monthCount(job({ planMonth: day(2026, 9, 1), planMonths: 4 }))).toBe(4)
    expect(monthCount(job({ planMonths: 0 }))).toBe(1)
    expect(monthCount(job({ planMonths: 99 }))).toBe(24)
    // An end before the start is nobody's plan: one month.
    expect(monthCount(job({ plannedStart: day(2026, 9, 20), plannedEnd: day(2026, 3, 1), planMonths: 5 }))).toBe(5)
  })

  it('lists the months it runs in, over New Year too, and which of them fall in a year', () => {
    const p = job({ planMonth: day(2026, 10, 1), planMonths: 4 })
    expect(monthSpan(p)).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2027, month: 0 },
      { year: 2027, month: 1 },
    ])
    expect(monthsInYear(p, 2026)).toEqual([10, 11])
    expect(monthsInYear(p, 2027)).toEqual([0, 1])
    expect(monthsInYear(p, 2025)).toEqual([])
    expect(monthSpan(job())).toEqual([])
  })
})

describe('spreadAmount', () => {
  it('spreads evenly and puts the odd cents on the last month', () => {
    expect(spreadAmount(3000, 3)).toEqual([1000, 1000, 1000])
    expect(spreadAmount(100, 3)).toEqual([33.33, 33.33, 33.34])
    expect(spreadAmount(0.05, 2)).toEqual([0.02, 0.03])
    expect(spreadAmount(500, 1)).toEqual([500])
  })
})

describe('moving a job', () => {
  it('keeps the day of the month, or takes the last day where the month is shorter', () => {
    expect(addMonths(day(2026, 9, 31), 1)).toEqual(day(2026, 10, 30))
    expect(addMonths(day(2026, 0, 31), 1)).toEqual(day(2026, 1, 28))
    expect(addMonths(day(2026, 11, 15), 2)).toEqual(day(2027, 1, 15))
    expect(addMonths(day(2026, 2, 15), -3)).toEqual(day(2025, 11, 15))
  })

  it('shifts fixed days by whole months and places the job; without fixed days it only places it', () => {
    expect(movedTo(job({ plannedStart: day(2026, 9, 15), plannedEnd: day(2026, 11, 20) }), { year: 2027, month: 0 })).toEqual({
      plannedStart: day(2027, 0, 15),
      plannedEnd: day(2027, 2, 20),
      planMonth: day(2027, 0, 1),
    })
    expect(movedTo(job({ planMonth: day(2026, 9, 1), planMonths: 2 }), { year: 2026, month: 5 })).toEqual({
      plannedStart: null,
      plannedEnd: null,
      planMonth: day(2026, 5, 1),
    })
    expect(movedTo(job(), { year: 2026, month: 5 })).toEqual({ plannedStart: null, plannedEnd: null, planMonth: day(2026, 5, 1) })
  })
})

describe('the month field', () => {
  it('reads and writes YYYY-MM and refuses anything else', () => {
    expect(monthInputValue(day(2026, 9, 1))).toBe('2026-10')
    expect(monthInputValue(null)).toBe('')
    expect(parseMonthInput('2026-10')).toEqual(day(2026, 9, 1))
    expect(parseMonthInput(' 2027-01 ')).toEqual(day(2027, 0, 1))
    expect(parseMonthInput('2026-13')).toBeNull()
    expect(parseMonthInput('2026-10-05')).toBeNull()
    expect(parseMonthInput('')).toBeNull()
  })
})
