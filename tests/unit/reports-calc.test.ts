import { describe, expect, it } from 'vitest'
import {
  businessDaysBetween,
  computeEfficiency,
  daysDiff,
  percentChange,
  sumThroughMonth,
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
