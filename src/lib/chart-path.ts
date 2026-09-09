/**
 * The geometry behind the revenue chart's curves — no React, no Next, so the
 * shape a reader ends up trusting can be checked by a test.
 */

/**
 * The indices of `values` grouped into runs of consecutive entries that hold
 * something. A curve is broken between runs: a year booked only as far as
 * September earns nothing after it, which is not the same as earning zero, and
 * a line dragged down to the axis would say the second.
 */
export function monthRuns(values: number[]): number[][] {
  const runs: number[][] = []
  let run: number[] = []
  values.forEach((value, i) => {
    if (value > 0) {
      run.push(i)
      return
    }
    if (run.length > 0) {
      runs.push(run)
      run = []
    }
  })
  if (run.length > 0) runs.push(run)
  return runs
}

/**
 * The path through the given points: straight from one to the next, or eased
 * at the corners.
 *
 * The eased one is a MONOTONE cubic (Fritsch–Carlson): between two points it
 * stays between their two values, so it cannot invent a peak above the highest
 * month of a year, and cannot dip under the axis into revenue nobody earned.
 * The ordinary Catmull-Rom spline does both — it overshoots by up to an eighth
 * of a rise, which in a revenue report is a figure the company never billed,
 * drawn above the topmost gridline.
 *
 * A single point becomes a hairline so a month standing on its own still shows.
 */
export function linePath(points: Array<[number, number]>, rounded: boolean): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0][0]} ${points[0][1]}h0.01`
  const straight = `M${points.map(([x, y]) => `${x} ${y}`).join('L')}`
  if (!rounded || points.length === 2) return straight

  const n = points.length
  const width: number[] = []
  const secant: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const w = points[i + 1][0] - points[i][0]
    if (w <= 0) return straight
    width.push(w)
    secant.push((points[i + 1][1] - points[i][1]) / w)
  }

  // A tangent per point: the average of the slopes either side of it, then
  // pulled back wherever that average would carry the curve past its ends.
  const slope: number[] = [secant[0]]
  for (let i = 1; i < n - 1; i++) slope.push((secant[i - 1] + secant[i]) / 2)
  slope.push(secant[n - 2])

  for (let i = 0; i < n - 1; i++) {
    if (secant[i] === 0) {
      // Two months alike: flat between them, or the curve would bulge.
      slope[i] = 0
      slope[i + 1] = 0
      continue
    }
    let a = slope[i] / secant[i]
    let b = slope[i + 1] / secant[i]
    // A turning point: the tangent there has to be flat, not carry on rising.
    if (a < 0) {
      slope[i] = 0
      a = 0
    }
    if (b < 0) {
      slope[i + 1] = 0
      b = 0
    }
    const squared = a * a + b * b
    if (squared > 9) {
      const pull = 3 / Math.sqrt(squared)
      slope[i] = pull * a * secant[i]
      slope[i + 1] = pull * b * secant[i]
    }
  }

  let d = `M${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const third = width[i] / 3
    d += `C${x0 + third} ${y0 + slope[i] * third} ${x1 - third} ${y1 - slope[i + 1] * third} ${x1} ${y1}`
  }
  return d
}
