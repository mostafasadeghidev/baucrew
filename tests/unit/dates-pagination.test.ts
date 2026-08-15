import { describe, expect, it } from 'vitest'
import { addDays, addMonths, iso, isoWeek, mondayOf, monthStart, utcDate } from '@/lib/dates'
import { PAGE_SIZE, parsePage } from '@/lib/pagination'

describe('dates', () => {
  it('mondayOf returns the ISO week start', () => {
    expect(iso(mondayOf(utcDate('2026-08-15')))).toBe('2026-08-10') // Saturday → Monday
    expect(iso(mondayOf(utcDate('2026-08-16')))).toBe('2026-08-10') // Sunday → previous Monday
    expect(iso(mondayOf(utcDate('2026-08-10')))).toBe('2026-08-10') // Monday stays
  })
  it('isoWeek matches the company Wochenplan numbering', () => {
    expect(isoWeek(utcDate('2026-07-27'))).toBe(31)
    expect(isoWeek(utcDate('2026-08-03'))).toBe(32)
    expect(isoWeek(utcDate('2026-08-10'))).toBe(33)
    expect(isoWeek(utcDate('2026-01-01'))).toBe(1)
    expect(isoWeek(utcDate('2027-01-01'))).toBe(53) // 2026 has 53 ISO weeks
  })
  it('addDays / month helpers stay in UTC', () => {
    expect(iso(addDays(utcDate('2026-08-31'), 1))).toBe('2026-09-01')
    expect(iso(monthStart(utcDate('2026-08-15')))).toBe('2026-08-01')
    expect(iso(addMonths(utcDate('2026-12-15'), 1))).toBe('2027-01-01')
  })
})

describe('pagination', () => {
  it('parsePage falls back to 1 for invalid input', () => {
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-3')).toBe(1)
    expect(parsePage('abc')).toBe(1)
    expect(parsePage('2.5')).toBe(1)
    expect(parsePage('7')).toBe(7)
  })
  it('page size is a sane default', () => {
    expect(PAGE_SIZE).toBe(20)
  })
})
