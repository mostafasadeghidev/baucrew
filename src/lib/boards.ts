/**
 * The boards of the projects page: which columns each has, how a board is
 * chosen when the page opens, and the rules the settings form and the drag
 * of a column follow.
 *
 * A column is a status. That is the whole reason the board can move a
 * project by dragging it: nothing but the status changes, and the schedule,
 * the reports and every automation read the status they always read. A
 * board is a *view* of the projects, not a second place they are kept.
 *
 * Pure, so every rule is tested without a database in sight.
 */
import { ALL_PROJECT_STATUSES, type ProjectStatusKey } from './prep-tab'

export const BOARD_NAME_MAX = 60
export const COLUMN_TITLE_MAX = 40
/** Which board this browser opened last, so the page comes back to it. */
export const BOARD_COOKIE = 'project-board'

export type BoardColumnDef = { status: ProjectStatusKey; title: string | null }

/**
 * The grounds a board can stand on, the way Trello offers them: plain colours
 * and a few gradients. Kept as CSS rather than classes — a key is stored, and
 * what it looks like is decided here, once.
 */
export const BOARD_BACKGROUNDS = {
  blue: '#0079bf',
  teal: '#00aecc',
  green: '#519839',
  orange: '#d29034',
  red: '#b04632',
  purple: '#89609e',
  pink: '#cd5a91',
  gray: '#838c91',
  ocean: 'linear-gradient(135deg, #0c66e4 0%, #09326c 100%)',
  forest: 'linear-gradient(135deg, #1f845a 0%, #60c6d2 100%)',
  sunset: 'linear-gradient(135deg, #e774bb 0%, #6e5dc6 100%)',
  ember: 'linear-gradient(135deg, #e34935 0%, #f5cd47 100%)',
} as const
export type BoardBackground = keyof typeof BOARD_BACKGROUNDS

/** A background's key as the form sent it, or null — none, or not one of ours. */
export function boardBackgroundKey(raw: string | null | undefined): BoardBackground | null {
  return raw && raw in BOARD_BACKGROUNDS ? (raw as BoardBackground) : null
}

/** What a stored key looks like; null is the app's own ground. */
export function boardBackgroundCss(key: string | null | undefined): string | null {
  const known = boardBackgroundKey(key)
  return known ? BOARD_BACKGROUNDS[known] : null
}

export function isProjectStatus(v: unknown): v is ProjectStatusKey {
  return typeof v === 'string' && (ALL_PROJECT_STATUSES as readonly string[]).includes(v)
}

/** Without repeats, keeping the first of each. */
const unique = <T>(list: T[]): T[] => [...new Set(list)]

/** A board's name as typed: trimmed and cut to length; null when there is none. */
export function cleanBoardName(raw: string): string | null {
  const name = raw.trim().slice(0, BOARD_NAME_MAX)
  return name ? name : null
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

/**
 * The columns from the settings form: a tick `column_<STATUS>` and a name
 * `title_<STATUS>` for each status.
 *
 * Ticking a box must not undo a board somebody has arranged by hand, so the
 * columns that survive keep the order they had and only the newly ticked ones
 * are appended — at the end, where they can be seen and moved, rather than
 * somewhere in the middle where a lifecycle thinks they belong. A name that is
 * the status's own, or blank, is no name.
 */
export function columnsFromForm(
  get: (name: string) => FormDataEntryValue | null,
  current: ProjectStatusKey[] = []
): BoardColumnDef[] {
  const ticked = ALL_PROJECT_STATUSES.filter((s) => get(`column_${s}`) === 'on')
  const picked = new Set(ticked)
  const kept = unique(current).filter((s) => picked.has(s))
  const added = ticked.filter((s) => !kept.includes(s))
  return [...kept, ...added].map((status) => {
    const raw = get(`title_${status}`)
    const title = typeof raw === 'string' ? raw.trim().slice(0, COLUMN_TITLE_MAX) : ''
    return { status, title: title ? title : null }
  })
}

/** The order a board was dragged into: its statuses, unique, in that order. */
export function cleanColumnOrder(statuses: unknown): ProjectStatusKey[] {
  return Array.isArray(statuses) ? unique(statuses.filter(isProjectStatus)) : []
}

/**
 * Which board the page opens: the one the address asks for, else the one this
 * browser opened last, else the first — and nothing when there is none.
 */
export function pickBoard<T extends { id: string }>(
  boards: T[],
  wanted?: string | null,
  remembered?: string | null
): T | null {
  return (
    (wanted && boards.find((b) => b.id === wanted)) ||
    (remembered && boards.find((b) => b.id === remembered)) ||
    boards[0] ||
    null
  )
}

/** What a column is called on its board: its own name, or the status's. */
export function columnLabel(column: { title: string | null }, statusLabel: string): string {
  return column.title ?? statusLabel
}
