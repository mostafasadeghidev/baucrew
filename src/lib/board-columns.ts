/**
 * Which statuses stand as columns on the project board.
 *
 * All nine to begin with — the office asked to see the whole way from enquiry
 * to paid — but a company that never marks anything "Storniert", or that lets
 * its bookkeeping end at "Abgerechnet", should not scroll past empty columns
 * for the life of the product. So the list is theirs to set, next to the one
 * that builds the combined tab on the project list.
 *
 * Stored as one JSON value under the AppSetting key `projectBoard`; the
 * parsing lives here, without a database in sight, so it can be tested.
 */
import { ALL_PROJECT_STATUSES, type ProjectStatusKey } from './prep-tab'

export const PROJECT_BOARD_KEY = 'projectBoard'

export type BoardConfig = {
  /**
   * Left to right, as the board shows them. The order of a project's life to
   * begin with, and after that whatever order the office dragged them into:
   * a company that quotes more than it builds wants the quote column first,
   * and no lifecycle can know that.
   */
  statuses: ProjectStatusKey[]
}

export const DEFAULT_BOARD: BoardConfig = { statuses: [...ALL_PROJECT_STATUSES] }

function isStatus(v: unknown): v is ProjectStatusKey {
  return typeof v === 'string' && (ALL_PROJECT_STATUSES as readonly string[]).includes(v)
}

/** Without repeats, keeping the first of each. */
function unique(statuses: ProjectStatusKey[]): ProjectStatusKey[] {
  return [...new Set(statuses)]
}

/**
 * A column picked up and set down somewhere else.
 *
 * Both ends are clamped and an unknown status is a no-op, because this is
 * driven by a pointer over a moving board: the column under the cursor can be
 * gone by the time the move is worked out.
 */
export function moveColumn<T extends string>(statuses: T[], moved: string, before: string): T[] {
  const from = statuses.indexOf(moved as T)
  const to = statuses.indexOf(before as T)
  if (from === -1 || to === -1 || from === to) return statuses
  const next = [...statuses]
  next.splice(from, 1)
  next.splice(to, 0, statuses[from])
  return next
}

export function parseBoardConfig(raw: string | null | undefined): BoardConfig {
  if (!raw) return { statuses: [...DEFAULT_BOARD.statuses] }
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return { statuses: [...DEFAULT_BOARD.statuses] }
  }
  if (typeof obj !== 'object' || obj === null) return { statuses: [...DEFAULT_BOARD.statuses] }
  const statuses = Array.isArray((obj as Record<string, unknown>).statuses)
    ? unique(((obj as Record<string, unknown>).statuses as unknown[]).filter(isStatus))
    : []
  // A board with no columns is not a board — an empty pick means "all of them"
  // rather than a page that shows nothing and cannot be undone from itself.
  return { statuses: statuses.length > 0 ? statuses : [...DEFAULT_BOARD.statuses] }
}

/**
 * Builds the config from the settings form (checkbox names `board_<KEY>`).
 *
 * Ticking a box must not undo a board somebody has arranged by hand, so the
 * columns that survive keep the order they had and only the newly ticked ones
 * are appended — at the end, where they can be seen and moved, rather than
 * somewhere in the middle where a lifecycle thinks they belong.
 */
export function boardConfigFromForm(
  get: (name: string) => FormDataEntryValue | null,
  current: ProjectStatusKey[] = DEFAULT_BOARD.statuses
): BoardConfig {
  const ticked = ALL_PROJECT_STATUSES.filter((s) => get(`board_${s}`) === 'on')
  if (ticked.length === 0) return { statuses: [...DEFAULT_BOARD.statuses] }
  const picked = new Set(ticked)
  const kept = unique(current).filter((s) => picked.has(s))
  const added = ticked.filter((s) => !kept.includes(s))
  return { statuses: [...kept, ...added] }
}

/** The order a board was dragged into, cleaned up before it is stored. */
export function boardConfigFromOrder(statuses: unknown): BoardConfig {
  const clean = Array.isArray(statuses) ? unique(statuses.filter(isStatus)) : []
  return { statuses: clean.length > 0 ? clean : [...DEFAULT_BOARD.statuses] }
}

export function serializeBoardConfig(c: BoardConfig): string {
  return JSON.stringify(c)
}
