/**
 * Reading a wheel gesture over something that scrolls sideways.
 *
 * A trackpad reports a few pixels of sideways movement on almost every
 * downward swipe, and a strip that can scroll sideways takes them: reading down
 * it slides it left and right under the eye. So a clearly sideways gesture —
 * two fingers across, or shift and the wheel — is left to the browser, and a
 * mostly downward one is for the page to decide: the revenue tab's scroll box
 * hands it on, the project board turns it into a sideways move where nothing
 * else on the page can scroll (see kanban.tsx).
 *
 * Pure, so the rule is tested without a browser.
 */

/** Firefox counts in lines and pages; everything else in pixels. */
export function wheelPixels(delta: number, mode: number, page: number): number {
  if (mode === 1) return delta * 16
  if (mode === 2) return delta * page
  return delta
}

/** Mostly up or down rather than sideways. A tie counts as up or down. */
export function isVerticalWheel(dx: number, dy: number): boolean {
  return dy !== 0 && Math.abs(dx) <= Math.abs(dy)
}
