import { describe, expect, it } from 'vitest'
import { addMonths, dayKey, inRange, monthGrid, monthOf } from '@/lib/calendar-grid'

describe('monthGrid', () => {
  it('draws six Monday-first weeks around the month', () => {
    // 1 October 2026 is a Thursday.
    const grid = monthGrid(2026, 9)
    expect(grid).toHaveLength(42)
    expect(grid[0]).toEqual({ day: '2026-09-28', inMonth: false })
    expect(grid[3]).toEqual({ day: '2026-10-01', inMonth: true })
    expect(grid.filter((d) => d.inMonth)).toHaveLength(31)
    expect(grid[41]).toEqual({ day: '2026-11-08', inMonth: false })
  })

  it('starts on the first when the month starts on a Monday', () => {
    // 1 June 2026 is a Monday.
    expect(monthGrid(2026, 5)[0]).toEqual({ day: '2026-06-01', inMonth: true })
  })

  it('handles February in a leap year', () => {
    expect(monthGrid(2028, 1).filter((d) => d.inMonth).map((d) => d.day).at(-1)).toBe('2028-02-29')
  })
})

describe('the helpers', () => {
  it('reads and writes days in UTC', () => {
    expect(dayKey(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05')
    expect(monthOf('2026-12-31')).toEqual({ year: 2026, month: 11 })
  })

  it('moves across the turn of the year', () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 })
  })

  it('knows a range only when both ends are there', () => {
    expect(inRange('2026-10-05', '2026-10-01', '2026-10-10')).toBe(true)
    expect(inRange('2026-10-11', '2026-10-01', '2026-10-10')).toBe(false)
    expect(inRange('2026-10-05', null, '2026-10-10')).toBe(false)
  })
})
