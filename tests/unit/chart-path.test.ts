import { describe, expect, it } from 'vitest'
import { linePath, monthRuns } from '@/lib/chart-path'

/**
 * Walks the path back off the string and samples every cubic, so the tests can
 * ask what the curve actually does between the months rather than what its
 * control points suggest.
 */
function samples(d: string): Array<[number, number]> {
  const numbers = (text: string) => text.trim().split(/[\s,]+/).map(Number)
  const [startX, startY] = numbers(d.slice(1).split('C')[0])
  let from: [number, number] = [startX, startY]
  const out: Array<[number, number]> = [from]
  for (const part of d.split('C').slice(1)) {
    const [c1x, c1y, c2x, c2y, x, y] = numbers(part)
    for (let step = 1; step <= 20; step++) {
      const t = step / 20
      const u = 1 - t
      out.push([
        u * u * u * from[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * from[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
      ])
    }
    from = [x, y]
  }
  return out
}

/** The chart's own geometry, so the numbers here are the ones on screen. */
const W = 960
const H = 226
const padL = 48
const padR = 12
const padT = 12
const padB = 34
const plotH = H - padT - padB
const slot = (W - padL - padR) / 12

/** Twelve monthly figures laid out the way the chart lays them out. */
function points(values: number[], yMax: number): Array<[number, number]> {
  return values.map((v, i) => [padL + slot * i + slot / 2, padT + plotH - (v / yMax) * plotH])
}

describe('monthRuns', () => {
  it('breaks the year where the months are empty', () => {
    expect(monthRuns([1, 2, 0, 0, 5, 6, 7, 0, 9, 0, 0, 0])).toEqual([[0, 1], [4, 5, 6], [8]])
  })

  it('handles a whole year, an empty year and a single month', () => {
    expect(monthRuns([1, 1, 1])).toEqual([[0, 1, 2]])
    expect(monthRuns([0, 0, 0])).toEqual([])
    expect(monthRuns([0, 0, 7])).toEqual([[2]])
  })
})

describe('linePath', () => {
  it('draws a hairline for a month standing on its own', () => {
    expect(linePath([[10, 20]], true)).toBe('M10 20h0.01')
  })

  it('joins the points straight when it is not asked to round', () => {
    expect(linePath([[0, 0], [10, 5], [20, 1]], false)).toBe('M0 0L10 5L20 1')
  })

  it('passes through every month it is given', () => {
    const p = points([45, 52, 88, 140, 210, 300, 300, 205, 150, 95, 60, 40], 300)
    const drawn = samples(linePath(p, true))
    for (const [x, y] of p) {
      const nearest = drawn.reduce((best, s) =>
        Math.abs(s[0] - x) < Math.abs(best[0] - x) ? s : best
      )
      expect(nearest[1]).toBeCloseTo(y, 6)
    }
  })

  // The plain Catmull-Rom spline this replaced rose to 311.565 € here, above
  // the year's highest month and above the topmost gridline.
  it('never rises above the highest month around it', () => {
    const values = [45, 52, 88, 140, 210, 300, 300, 205, 150, 95, 60, 40]
    const top = padT + plotH - (300 / 300) * plotH
    for (const y of samples(linePath(points(values, 300), true)).map((s) => s[1])) {
      expect(y).toBeGreaterThanOrEqual(top - 1e-9)
    }
  })

  // And here it dipped to −4.895 €, drawing revenue nobody could have billed.
  it('never dips below the lowest month around it, and so never below zero', () => {
    const values = [3, 4, 120, 90, 60, 40, 30, 25, 20, 18, 15, 12]
    const floor = padT + plotH
    for (const y of samples(linePath(points(values, 150), true)).map((s) => s[1])) {
      expect(y).toBeLessThanOrEqual(floor + 1e-9)
    }
  })

  it('stays inside the two months of every segment it draws', () => {
    const cases = [
      [10, 12, 9, 11, 250, 8, 10, 12, 9, 11, 10, 12],
      [30, 35, 60, 90, 120, 150, 150, 20, 40, 55, 30, 25],
      [20, 150, 150, 20, 20, 20, 20, 20, 20, 20, 20, 20],
      [1, 300, 1, 300, 1, 300, 1, 300, 1, 300, 1, 300],
    ]
    for (const values of cases) {
      const max = Math.max(...values)
      const p = points(values, max)
      const drawn = samples(linePath(p, true))
      for (let i = 0; i < p.length - 1; i++) {
        const lo = Math.min(p[i][1], p[i + 1][1])
        const hi = Math.max(p[i][1], p[i + 1][1])
        for (const [x, y] of drawn) {
          if (x < p[i][0] - 1e-9 || x > p[i + 1][0] + 1e-9) continue
          expect(y).toBeGreaterThanOrEqual(lo - 1e-6)
          expect(y).toBeLessThanOrEqual(hi + 1e-6)
        }
      }
    }
  })

  it('keeps two alike months flat between them', () => {
    const p = points([50, 100, 100, 50, 50, 50, 50, 50, 50, 50, 50, 50], 100)
    const flat = samples(linePath(p, true)).filter(
      ([x]) => x >= p[1][0] - 1e-9 && x <= p[2][0] + 1e-9
    )
    for (const [, y] of flat) expect(y).toBeCloseTo(p[1][1], 6)
  })
})
