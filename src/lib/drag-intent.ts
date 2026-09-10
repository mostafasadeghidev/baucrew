/**
 * What a press on a board card turns out to mean.
 *
 * A board wider than the window has to be pushed sideways, and the readiest
 * way to push it is to grab it and pull — but the thing under the cursor is
 * usually a card, and with the browser's own drag and drop a card is picked up
 * the instant the mouse moves at all. So pulling the board sideways moved a
 * project into another status instead, and the person doing it could not even
 * say which project it had been.
 *
 * The way out is to wait for the first few pixels and read them. Sideways
 * means the board: nobody drags a card left to file it, the columns are what
 * lies left and right and they are reached by moving the board, not the card.
 * Anything else — down, up, diagonal — means the card. Below the threshold it
 * means nothing yet, and a press that never passes it is a click, so the
 * project's name still opens the project.
 *
 * Pure so the rule can be tested without a browser.
 */

/** How far the pointer must travel before the gesture has a meaning. */
export const DRAG_THRESHOLD = 6

export type DragIntent = 'none' | 'board' | 'card'

export function dragIntent(dx: number, dy: number, threshold = DRAG_THRESHOLD): DragIntent {
  if (Math.hypot(dx, dy) < threshold) return 'none'
  // Ties go to the card: a diagonal pull is somebody carrying a card to a
  // column they can already see, and reading that as a scroll would drop it.
  return Math.abs(dx) > Math.abs(dy) ? 'board' : 'card'
}
