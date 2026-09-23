/**
 * Where a card stands in its column, the way a Trello list is ordered: by
 * hand. A card carries a position; the column reads the placed cards in
 * order of position and the unplaced ones after them, newest first, so a
 * board nobody has arranged looks exactly as it did before anybody could.
 *
 * A card put between two others takes the midpoint of their positions, so a
 * move writes one row and not a column. Midpoints halve the gap every time,
 * and a gap halved sixty times is gone — then the column is numbered afresh.
 *
 * Pure: the DOM tells the component where the pointer is; everything that
 * follows from that is here, and tested.
 */

/** A card as the order sees it. */
export type Placed = { position: number | null; number: string }

/** The gap between two neighbours below which the column is renumbered. */
export const MIN_GAP = 1e-6

/** The distance a card is placed beyond the last, or before the first. */
const STEP = 1

/**
 * The position a card takes between two neighbours; either may be missing.
 * Alone in a column it stands at 0.
 */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return 0
  if (prev == null) return next! - STEP
  if (next == null) return prev + STEP
  return (prev + next) / 2
}

/** True when two neighbours stand too close for a card to be put between them. */
export function tooClose(prev: number | null, next: number | null): boolean {
  return prev != null && next != null && next - prev < MIN_GAP
}

/**
 * A column's cards in the order the board shows them: the placed ones by
 * position, then the unplaced ones by number, newest first. Stable, so two
 * cards at one position keep the order they came in.
 */
export function orderCards<T extends Placed>(cards: T[]): T[] {
  return [...cards].sort((a, b) => {
    if (a.position != null && b.position != null) return a.position - b.position
    if (a.position != null) return -1
    if (b.position != null) return 1
    return b.number.localeCompare(a.number)
  })
}

/** Positions 0, 1, 2 … for a column numbered afresh, in the order given. */
export function renumbered<T extends { id: string }>(cards: T[]): Array<{ id: string; position: number }> {
  return cards.map((card, position) => ({ id: card.id, position }))
}

/**
 * Where a carried card goes in a column, from the vertical middles of the
 * cards already there and the pointer's height: before the first card whose
 * middle is below the pointer, else after the last. The carried card itself
 * is not among `middles`.
 */
export function insertIndex(middles: number[], y: number): number {
  const at = middles.findIndex((middle) => y < middle)
  return at === -1 ? middles.length : at
}

/** The ways a column can be sorted from its menu. */
export const COLUMN_SORTS = ['name', 'number', 'start', 'created'] as const
export type ColumnSort = (typeof COLUMN_SORTS)[number]

export function isColumnSort(value: unknown): value is ColumnSort {
  return typeof value === 'string' && (COLUMN_SORTS as readonly string[]).includes(value)
}

/** A column's cards in the order a sort asks for; dates missing go last. */
export function sortedBy<T extends { name: string; number: string; plannedStart: Date | null; createdAt: Date }>(
  cards: T[],
  by: ColumnSort
): T[] {
  const byDate = (pick: (card: T) => Date | null) => (a: T, b: T) => {
    const da = pick(a)
    const dbb = pick(b)
    if (da && dbb) return da.getTime() - dbb.getTime()
    if (da) return -1
    if (dbb) return 1
    return b.number.localeCompare(a.number)
  }
  const compare =
    by === 'name'
      ? (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || b.number.localeCompare(a.number)
      : by === 'number'
        ? (a: T, b: T) => b.number.localeCompare(a.number)
        : by === 'start'
          ? byDate((card) => card.plannedStart)
          : byDate((card) => card.createdAt)
  return [...cards].sort(compare)
}
