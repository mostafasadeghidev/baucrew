/**
 * A board as the settings window edits it: its name, its colour and its
 * columns, all in one draft that is saved at once. The window draws the draft
 * as a small board while it is typed, so nothing is written until "Speichern"
 * — and the rules a saved board must keep are checked here, once, for the
 * window (to say what is wrong next to the column) and for the server (to
 * refuse it).
 *
 * A column is still what it always was (src/lib/boards.ts): a status, with a
 * name of its own if wanted, and maybe a rule that makes it hold only some of
 * that status's cards (src/lib/board-rules.ts).
 *
 * Pure, so every rule is tested without a database.
 */
import { ALL_PROJECT_STATUSES, type ProjectStatusKey } from './prep-tab'
import { BOARD_NAME_MAX, COLUMN_ID, COLUMN_TITLE_MAX, boardBackgroundKey, cleanBoardName, isProjectStatus, type BoardBackground } from './boards'
import { COLUMN_RULES, RULE_STATUS, TRELLO_RULE_PREFIX, columnRuleKey, trelloRuleId, type ColumnRule } from './board-rules'
import type { BoardPreset } from './board-presets'
import { labelColorKey, type LabelColor } from './board-cards'

/** More columns than this is a mistake, not a board. */
export const BOARD_COLUMNS_MAX = 60

/**
 * What a new blank board starts with: the way a job runs, from the enquiry to
 * the finished site. The statuses after it (invoiced, paid, cancelled) are
 * the office's books, a click away.
 */
export const DEFAULT_BOARD_STATUSES: ProjectStatusKey[] = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED']

/**
 * One column in the window. `id` is the saved column's, null for one added
 * here; `key` tells rows apart while dragging; `color` is the list's tint on
 * the board, null for the plain grey.
 */
export type DraftColumn = { key: string; id: string | null; status: ProjectStatusKey; title: string; rule: string | null; color: LabelColor | null }

export type BoardDraft = { name: string; background: BoardBackground | null; showOnSites: boolean; columns: DraftColumn[] }

/**
 * What kind of column it is, which decides what the window lets be changed:
 * a plain column may show any status; a rule column always shows its rule's
 * status; a Trello column mirrors a Trello list and may sit over any status.
 */
export type ColumnKind = 'status' | 'rule' | 'trello'

export function columnKind(rule: string | null): ColumnKind {
  if (rule === null) return 'status'
  return trelloRuleId(rule) !== null ? 'trello' : 'rule'
}

const sameColumn = (a: { status: string; rule: string | null }, b: { status: string; rule: string | null }) =>
  a.status === b.status && (a.rule ?? null) === (b.rule ?? null)

/**
 * The keys of the columns that repeat one before them: two columns showing
 * the same status by the same rule split nothing — the second stays empty.
 */
export function duplicateColumns(columns: Array<{ key: string; status: string; rule: string | null }>): Set<string> {
  const seen: Array<{ status: string; rule: string | null }> = []
  const twice = new Set<string>()
  for (const column of columns) {
    if (seen.some((s) => sameColumn(s, column))) twice.add(column.key)
    else seen.push(column)
  }
  return twice
}

/** A list with one item moved from one place to another; ends out of range change nothing. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

let counter = 0
/** A key for a row made in the window; it only has to differ from its neighbours. */
export function draftKey(): string {
  counter += 1
  return `new-${counter}`
}

/** The draft of a board that is there already. */
export function draftFromBoard(board: {
  name: string
  background: string | null
  showOnSites?: boolean
  columns: Array<{ id: string; status: string; title: string | null; rule: string | null; color?: string | null }>
}): BoardDraft {
  return {
    name: board.name,
    background: boardBackgroundKey(board.background),
    showOnSites: board.showOnSites ?? false,
    columns: board.columns
      .filter((c) => isProjectStatus(c.status))
      .map((c) => ({ key: c.id, id: c.id, status: c.status as ProjectStatusKey, title: c.title ?? '', rule: c.rule, color: labelColorKey(c.color) })),
  }
}

/** A plain column for a status, new. */
export function statusColumn(status: ProjectStatusKey): DraftColumn {
  return { key: draftKey(), id: null, status, title: '', rule: null, color: null }
}

/** A rule column, new, under its rule's status. */
export function ruleColumn(rule: ColumnRule): DraftColumn {
  return { key: draftKey(), id: null, status: RULE_STATUS[rule] as ProjectStatusKey, title: '', rule, color: null }
}

/** What a new board starts with when nothing else is chosen. */
export function blankDraft(): BoardDraft {
  return { name: '', background: 'blue', showOnSites: false, columns: DEFAULT_BOARD_STATUSES.map(statusColumn) }
}

/** A ready-made board as a draft; nothing of it is saved until the window is. */
export function draftFromPreset(preset: BoardPreset): BoardDraft {
  return {
    name: preset.name,
    background: boardBackgroundKey(preset.background),
    showOnSites: false,
    columns: preset.columns.map((c) => ({ key: draftKey(), id: null, status: c.status, title: c.title ?? '', rule: c.rule, color: null })),
  }
}

/** Another board's columns as new ones — own names, colours and rule lists included. */
export function copiedColumns(columns: Array<{ status: string; title: string | null; rule: string | null; color?: string | null }>): DraftColumn[] {
  return columns
    .filter((c) => isProjectStatus(c.status))
    .map((c) => ({ key: draftKey(), id: null, status: c.status as ProjectStatusKey, title: c.title ?? '', rule: c.rule, color: labelColorKey(c.color) }))
}

/**
 * What "Spalte hinzufügen" offers: the statuses the board has no plain
 * column for, and the rule columns it does not have yet.
 */
export function addableColumns(columns: Array<{ status: string; rule: string | null }>): {
  statuses: ProjectStatusKey[]
  rules: ColumnRule[]
} {
  return {
    statuses: ALL_PROJECT_STATUSES.filter((s) => !columns.some((c) => sameColumn(c, { status: s, rule: null }))),
    rules: COLUMN_RULES.filter((r) => !columns.some((c) => sameColumn(c, { status: RULE_STATUS[r], rule: r }))),
  }
}

export type CleanColumn = { id: string | null; status: ProjectStatusKey; title: string | null; rule: string | null; color: LabelColor | null }
export type CleanBoard = { name: string; background: BoardBackground | null; showOnSites: boolean; columns: CleanColumn[] }
export type DraftError = 'name' | 'noColumns' | 'tooMany' | 'column' | 'duplicate'

/**
 * A draft as the window sent it, made safe — or what is wrong with it. A
 * rule column always stands under its rule's status, whatever was sent; a
 * blank name is no name; ids that do not look like a column's are new columns;
 * a colour that is not one of ours is the plain grey.
 */
export function cleanBoardDraft(raw: unknown): { board: CleanBoard } | { error: DraftError } {
  const input = (raw ?? {}) as { name?: unknown; background?: unknown; showOnSites?: unknown; columns?: unknown }
  const name = cleanBoardName(typeof input.name === 'string' ? input.name : '')
  if (!name) return { error: 'name' }
  if (!Array.isArray(input.columns) || input.columns.length === 0) return { error: 'noColumns' }
  if (input.columns.length > BOARD_COLUMNS_MAX) return { error: 'tooMany' }
  const columns: CleanColumn[] = []
  for (const item of input.columns as unknown[]) {
    if (!item || typeof item !== 'object') return { error: 'column' }
    const raw = item as Record<string, unknown>
    const rawRule = raw.rule == null || raw.rule === '' ? null : raw.rule
    const fixed = columnRuleKey(rawRule)
    const listId = trelloRuleId(rawRule)
    let status: ProjectStatusKey
    let rule: string | null
    if (fixed) {
      rule = fixed
      status = RULE_STATUS[fixed] as ProjectStatusKey
    } else {
      if (rawRule !== null && listId === null) return { error: 'column' }
      if (!isProjectStatus(raw.status)) return { error: 'column' }
      rule = listId !== null ? `${TRELLO_RULE_PREFIX}${listId}` : null
      status = raw.status
    }
    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, COLUMN_TITLE_MAX) : ''
    const id = typeof raw.id === 'string' && COLUMN_ID.test(raw.id) ? raw.id : null
    columns.push({ id, status, title: title || null, rule, color: labelColorKey(typeof raw.color === 'string' ? raw.color : null) })
  }
  if (duplicateColumns(columns.map((c, i) => ({ ...c, key: String(i) }))).size > 0) return { error: 'duplicate' }
  return {
    board: {
      name: name.slice(0, BOARD_NAME_MAX),
      background: boardBackgroundKey(typeof input.background === 'string' ? input.background : null),
      // Only a plain yes ticks it; anything else leaves Baustellen to another board.
      showOnSites: input.showOnSites === true,
      columns,
    },
  }
}

export type ColumnSavePlan = {
  remove: string[]
  update: Array<{ id: string; status: ProjectStatusKey; title: string | null; color: LabelColor | null; sortOrder: number }>
  create: Array<{ status: ProjectStatusKey; title: string | null; rule: string | null; color: LabelColor | null; sortOrder: number }>
}

/**
 * What saving a board's columns does to the ones it has: the ones the draft
 * left out go, the ones it kept take their new place, name, colour and status, and
 * the rest are made. An id the board does not have is a new column — never
 * another board's column moved over. A kept column keeps its rule: that is
 * what it is, and the window does not change it.
 */
export function planColumnSave(existing: Array<{ id: string; rule: string | null }>, wanted: CleanColumn[]): ColumnSavePlan {
  const own = new Map(existing.map((c) => [c.id, c]))
  const kept = new Set<string>()
  const plan: ColumnSavePlan = { remove: [], update: [], create: [] }
  wanted.forEach((column, sortOrder) => {
    const had = column.id ? own.get(column.id) : undefined
    if (had && !kept.has(had.id) && (had.rule ?? null) === column.rule) {
      kept.add(had.id)
      plan.update.push({ id: had.id, status: column.status, title: column.title, color: column.color, sortOrder })
    } else {
      plan.create.push({ status: column.status, title: column.title, rule: column.rule, color: column.color, sortOrder })
    }
  })
  plan.remove = existing.filter((c) => !kept.has(c.id)).map((c) => c.id)
  return plan
}

/** The boards' order as dragged: their ids, each once, only the ones there are; the rest after them as they stood. */
export function cleanBoardOrder(ids: unknown, existing: string[]): string[] {
  const wanted = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && existing.includes(id)) : []
  const unique = [...new Set(wanted)]
  return [...unique, ...existing.filter((id) => !unique.includes(id))]
}
