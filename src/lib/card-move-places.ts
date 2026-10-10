/**
 * Where a card can be moved: every board, its lists and the cards standing
 * in each — what Trello's "Karte verschieben" offers. Computed from small
 * rows (no prices, no text), so both the board page and the card's own route
 * feed it the same way. Pure, so the placement rules are tested without a
 * request.
 */

import { orderCards } from './board-order'
import { columnFor, columnRuleKey, trelloRuleId } from './board-rules'
import { columnLabel } from './boards'

export type MoveColumn = { id: string; label: string; status: string; rule: string | null; cardIds: string[] }
export type MoveBoard = { id: string; name: string; columns: MoveColumn[] }
export type CardMovePlaces = {
  /** The board the card was opened on, and the list it stands in there; null when that board has none for it. */
  boardId: string | null
  columnId: string | null
  boards: MoveBoard[]
}

/** What decides a card's list, and the order it stands in — one row per project. */
export type MoveRow = {
  id: string
  number: string
  status: string
  boardPosition: number | null
  pausedAt: Date | null
  plannedStart: Date | null
  planMonth: Date | null
  priority: string | null
  invoice1: boolean
  /** The Trello list the project's card stands in — what a mirror rule's list reads. */
  trelloListId: string | null
}

export type MoveBoardInput = {
  id: string
  name: string
  columns: { id: string; status: string; title: string | null; rule: string | null }[]
}

/** The facts `columnFor` reads — a row's status first, then what its rules read. */
export function moveFacts(
  p: Pick<MoveRow, 'status' | 'pausedAt' | 'plannedStart' | 'planMonth' | 'priority' | 'invoice1'> & { trelloListId?: string | null }
) {
  return { status: p.status, pausedAt: p.pausedAt, plannedStart: p.plannedStart, planMonth: p.planMonth, priority: p.priority, invoice1: p.invoice1, trelloListId: p.trelloListId ?? null }
}

/** The list of this board the card's facts belong to; null when none does. */
export function moveColumnFor(
  columns: { key: string; status: string; rule: string | null }[],
  facts: ReturnType<typeof moveFacts>,
  currentYear: number
): string | null {
  return columnFor(columns, facts.status, facts, currentYear)?.key ?? null
}

/**
 * Every board with its lists and, in each, the cards in their placed order.
 * `labelFor` names a list: its own title, or the status (a rule's list its
 * rule's name). `columnId` is where the card stands on `boardId` — the board
 * page reads it off its own cards, the card route from the card's facts.
 */
export function assembleMovePlaces({
  boards,
  rows,
  currentYear,
  boardId,
  columnId,
  labelFor,
}: {
  boards: MoveBoardInput[]
  rows: MoveRow[]
  currentYear: number
  boardId: string | null
  columnId: string | null
  /** (status, rule) → the list's name. */
  labelFor: (status: string, rule: string | null) => string
}): CardMovePlaces {
  const places = boards.map((b) => {
    const keys = b.columns.map((c) => ({ key: c.id, status: c.status, rule: c.rule }))
    const byColumn = new Map<string, MoveRow[]>()
    for (const p of rows) {
      const key = columnFor(keys, p.status, moveFacts(p), currentYear)?.key
      if (key) byColumn.set(key, [...(byColumn.get(key) ?? []), p])
    }
    return {
      id: b.id,
      name: b.name,
      columns: b.columns.map((c) => {
        // A fixed rule by its key, a Trello list's mirror rule as it is written
        // — the move has to carry the latter too, or the card's list on the
        // other side would never be told.
        const rule = columnRuleKey(c.rule) ?? (trelloRuleId(c.rule) ? c.rule : null)
        return {
          id: c.id,
          label: columnLabel(c, labelFor(c.status, rule)),
          status: c.status,
          rule,
          cardIds: orderCards((byColumn.get(c.id) ?? []).map((p) => ({ ...p, position: p.boardPosition }))).map((p) => p.id),
        }
      }),
    }
  })
  return { boardId, columnId, boards: places }
}
