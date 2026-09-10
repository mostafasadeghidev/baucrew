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
  /** In the order of the project's life, never the order they were ticked. */
  statuses: ProjectStatusKey[]
}

export const DEFAULT_BOARD: BoardConfig = { statuses: [...ALL_PROJECT_STATUSES] }

function isStatus(v: unknown): v is ProjectStatusKey {
  return typeof v === 'string' && (ALL_PROJECT_STATUSES as readonly string[]).includes(v)
}

/** In lifecycle order, without repeats — however they arrived. */
function ordered(statuses: ProjectStatusKey[]): ProjectStatusKey[] {
  const picked = new Set(statuses)
  return ALL_PROJECT_STATUSES.filter((s) => picked.has(s))
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
    ? ((obj as Record<string, unknown>).statuses as unknown[]).filter(isStatus)
    : []
  // A board with no columns is not a board — an empty pick means "all of them"
  // rather than a page that shows nothing and cannot be undone from itself.
  return { statuses: statuses.length > 0 ? ordered(statuses) : [...DEFAULT_BOARD.statuses] }
}

/** Builds the config from the settings form (checkbox names `board_<KEY>`). */
export function boardConfigFromForm(get: (name: string) => FormDataEntryValue | null): BoardConfig {
  const statuses = ALL_PROJECT_STATUSES.filter((s) => get(`board_${s}`) === 'on')
  return { statuses: statuses.length > 0 ? [...statuses] : [...DEFAULT_BOARD.statuses] }
}

export function serializeBoardConfig(c: BoardConfig): string {
  return JSON.stringify(c)
}
