import { describe, expect, it } from 'vitest'
import { bestQuarter, quarterBreakdown } from '@/lib/reports-calc'

const months = (...values: number[]) => Array.from({ length: 12 }, (_, i) => values[i] ?? 0)

describe('quarterBreakdown', () => {
  it('folds twelve months into four quarters', () => {
    const rows = quarterBreakdown(months(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12))
    expect(rows.map((r) => r.total)).toEqual([6, 15, 24, 33])
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3])
  })

  it('gives every quarter its share of the year, and the shares add up', () => {
    const rows = quarterBreakdown(months(10, 0, 0, 10, 0, 0, 20, 0, 0, 60, 0, 0))
    expect(rows.map((r) => r.share)).toEqual([0.1, 0.1, 0.2, 0.6])
    expect(rows.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1)
  })

  it('leaves an empty year at zero rather than dividing by it', () => {
    const rows = quarterBreakdown(months())
    expect(rows.every((r) => r.total === 0 && r.share === 0)).toBe(true)
    expect(bestQuarter(rows)).toBeNull()
  })

  it('measures each quarter against the same quarter of another year', () => {
    const rows = quarterBreakdown(months(100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), [
      { year: 2025, months: months(50, 0, 0, 80, 0, 0, 0, 0, 0, 0, 0, 0) },
    ])
    expect(rows[0].compare[0]).toEqual({ year: 2025, total: 50, percent: 100 })
    // Q2 fell from 80 to nothing — a fall of a hundred per cent, not silence.
    expect(rows[1].compare[0]).toEqual({ year: 2025, total: 80, percent: -100 })
    // Q3 has nothing on either side: there is no change to state.
    expect(rows[2].compare[0]).toEqual({ year: 2025, total: 0, percent: null })
  })

  it('keeps the comparison years in the order they were given', () => {
    const rows = quarterBreakdown(months(10), [
      { year: 2025, months: months(5) },
      { year: 2024, months: months(20) },
    ])
    expect(rows[0].compare.map((c) => c.year)).toEqual([2025, 2024])
    expect(rows[0].compare.map((c) => c.percent)).toEqual([100, -50])
  })

  it('survives short or ragged month arrays', () => {
    const rows = quarterBreakdown([5, 5], [{ year: 2025, months: [] }])
    expect(rows[0].total).toBe(10)
    expect(rows[3].total).toBe(0)
    expect(rows[0].compare[0].percent).toBeNull()
  })

  it('names the biggest quarter, and only when there is one', () => {
    const rows = quarterBreakdown(months(1, 0, 0, 0, 0, 0, 9, 0, 0, 2))
    expect(bestQuarter(rows)?.index).toBe(2)
    expect(bestQuarter(quarterBreakdown(months(0, 0, 0)))).toBeNull()
  })

  it('breaks a tie towards the earlier quarter', () => {
    const rows = quarterBreakdown(months(7, 0, 0, 7))
    expect(bestQuarter(rows)?.index).toBe(0)
  })
})
