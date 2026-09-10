/**
 * Pulling apart map pins that landed on the same spot.
 *
 * Two building sites in one town both fall back to the town centre when the
 * project was entered without picking an address from the suggestions — same
 * coordinates, so the second marker sits exactly under the first and only the
 * top one is ever seen. Nothing on the map says the other is there; you find
 * it by noticing a number missing from the legend.
 *
 * So pins that share a place are arranged on a small circle around it, and the
 * circle is measured **on the ground**, not on the screen. Screen pixels were
 * the first idea and they were wrong: a gap that stays twenty pixels wide is
 * twenty metres when you are looking at a town and twenty kilometres when you
 * are looking at Bavaria, so zooming out threw the pins into neighbouring
 * districts. A few hundred metres stays inside the town at every zoom. The
 * price is that far out the pins still sit on each other — which is honest,
 * because far out they *are* in the same place; zoom into the town and they
 * come apart.
 *
 * This file answers with moved coordinates and leaves the map to draw them, so
 * the arithmetic can be tested without a browser in the room.
 */

export type Placed = { lat: number; lng: number }

/** Six decimals is about ten centimetres — closer than any address gets. */
const key = (p: Placed) => `${p.lat.toFixed(6)}|${p.lng.toFixed(6)}`

const METRES_PER_DEGREE = 111_320

export function spreadOverlapping<T extends Placed>(
  points: T[],
  /**
   * Radius of the circle the sharers stand on. Three hundred metres is a few
   * streets: far enough that the pins come apart once the town fills the pane,
   * near enough that they never leave the town they belong to.
   */
  metres = 300
): Array<T & { spread: boolean }> {
  const groups = new Map<string, number[]>()
  points.forEach((p, i) => {
    const k = key(p)
    const found = groups.get(k)
    if (found) found.push(i)
    else groups.set(k, [i])
  })

  const out: Array<T & { spread: boolean }> = points.map((p) => ({ ...p, spread: false }))
  for (const indices of groups.values()) {
    const n = indices.length
    if (n < 2) continue
    // Four stand comfortably on the circle as it is; a bigger crowd widens it
    // a little, but never past half again — the town has an edge.
    const radius = metres * Math.min(1.5, Math.max(1, n / 4))
    indices.forEach((index, i) => {
      const point = points[index]
      // Zero is due north, so a pair stands one above the other rather than
      // side by side, where the numbers are harder to tell apart.
      const angle = (i / n) * 2 * Math.PI
      const dLat = (radius / METRES_PER_DEGREE) * Math.cos(angle)
      // A degree of longitude is shorter the further from the equator; near
      // the poles it is nothing at all, so the divisor is floored.
      const shrink = Math.max(0.01, Math.cos((point.lat * Math.PI) / 180))
      const dLng = ((radius / METRES_PER_DEGREE) * Math.sin(angle)) / shrink
      out[index] = { ...point, lat: point.lat + dLat, lng: point.lng + dLng, spread: true }
    })
  }
  return out
}
