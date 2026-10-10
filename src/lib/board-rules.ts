/**
 * Lists that hold only some of a status's cards, the way the client's Trello
 * board had them: "Pause" beside "Baustelle läuft", "Aufträge für nächstes
 * Jahr" beside "Aufträge", a waiting list of the small jobs, the running
 * sites whose first invoice went out. A column is still a status — that is
 * what dragging into it sets — but it may carry a rule as well, and then it
 * shows the cards of its status that the rule picks, while the plain column
 * of the same status shows the rest.
 *
 * Beside the four rules of our own there is the mirror rule "trello:<list
 * id>": it picks the cards whose Trello card stands in that list of theirs,
 * so a board can carry their lists one to one without statuses of their own.
 * Where the card stands is read off the project's Trello link
 * (ProjectLink.externalListId) and kept there by the import and by the drop.
 *
 * Dropping a card into a rule column does what the rule says (puts the job
 * on hold, marks it low priority, plans it for next year); dropping it out
 * again undoes it. One rule cannot be set by a drag — an invoice is the
 * office's, marked on the project — so that list only fills by itself.
 *
 * Pure, so every rule is tested without a board.
 */

import { firstMonth, monthDate } from './plan-month'

export const COLUMN_RULES = ['paused', 'nextYear', 'lowPriority', 'invoice1'] as const
export type ColumnRule = (typeof COLUMN_RULES)[number]

/** The prefix of a mirror rule naming the Trello list it holds. */
export const TRELLO_RULE_PREFIX = 'trello:'

/** The list id of a mirror rule — "trello:671f90fa…" → "671f90fa…"; else null. */
export function trelloRuleId(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith(TRELLO_RULE_PREFIX)) return null
  const id = raw.slice(TRELLO_RULE_PREFIX.length).trim()
  return /^[0-9a-f]{8,}$/i.test(id) ? id : null
}

/** The status a rule's list always belongs to. */
export const RULE_STATUS: Record<ColumnRule, string> = {
  paused: 'IN_PROGRESS',
  nextYear: 'APPROVED',
  lowPriority: 'APPROVED',
  invoice1: 'IN_PROGRESS',
}

export function columnRuleKey(raw: unknown): ColumnRule | null {
  return typeof raw === 'string' && (COLUMN_RULES as readonly string[]).includes(raw) ? (raw as ColumnRule) : null
}

/** What a rule reads off a project. */
export type RuleFacts = {
  pausedAt: Date | null
  plannedStart: Date | null
  /** The month the office placed the job in, when no start is fixed. */
  planMonth: Date | null
  priority: string | null
  /** Whether the first invoice was marked ready. */
  invoice1: boolean
  /** The Trello list the project's card stands in, when it has one. */
  trelloListId?: string | null
}

export function ruleMatches(rule: ColumnRule, facts: RuleFacts, currentYear: number): boolean {
  switch (rule) {
    case 'paused':
      return facts.pausedAt !== null
    case 'nextYear': {
      const first = firstMonth({ plannedStart: facts.plannedStart, plannedEnd: null, planMonth: facts.planMonth, planMonths: 1 })
      return first !== null && first.year > currentYear
    }
    case 'lowPriority':
      return facts.priority === 'LOW'
    case 'invoice1':
      return facts.invoice1
  }
}

/** Whether a column's own rule — fixed or mirror — picks the project. */
export function ruleMatchesRaw(rawRule: string | null, facts: RuleFacts, currentYear: number): boolean {
  const listId = trelloRuleId(rawRule)
  if (listId !== null) return facts.trelloListId === listId
  const rule = columnRuleKey(rawRule)
  return rule !== null && ruleMatches(rule, facts, currentYear)
}

/**
 * Which of a board's columns a project stands in: among the columns of its
 * status, the first rule column whose rule it satisfies, else the plain one;
 * null when the board has no column for it.
 */
export function columnFor<T extends { key: string; status: string; rule: string | null }>(
  columns: T[],
  status: string,
  facts: RuleFacts,
  currentYear: number
): T | null {
  const own = columns.filter((c) => c.status === status)
  const ruled = own.find((c) => c.rule !== null && ruleMatchesRaw(c.rule, facts, currentYear))
  return ruled ?? own.find((c) => c.rule === null) ?? null
}

/** The changes a drop makes beyond the status: what the rule left behind undone, what the new one asks for. */
export type RulePatch = { pausedAt?: Date | null; priority?: string | null; planMonth?: Date | null; trelloListId?: string | null }

/**
 * What dragging a card from one column into another does to it, beyond the
 * status — or 'refused' where the rule is not a drag's to set. Leaving a
 * rule column undoes its rule, except next year's list: the dates are the
 * office's, and the card simply goes where they put it. Dropping into next
 * year's list places the job in January of next year — a rough month, not
 * a fixed day — unless it stands in a later year already. The mirror rule's
 * `trelloListId` is not the project's to write; the caller keeps it on the
 * project's Trello link.
 */
export function dropPatch(
  from: string | null,
  to: string | null,
  facts: RuleFacts,
  now: Date
): RulePatch | 'refused' | 'fixedStart' {
  if (to === 'invoice1') return 'refused'
  // A fixed start this year or earlier outranks a rough month: the card would
  // stay where it is while its month changed unseen. The date is moved first.
  if (to === 'nextYear' && facts.plannedStart && facts.plannedStart.getUTCFullYear() <= now.getUTCFullYear()) return 'fixedStart'
  const fromTrello = trelloRuleId(from)
  const toTrello = trelloRuleId(to)
  const patch: RulePatch = {}
  if (from === 'paused' && to !== 'paused') patch.pausedAt = null
  if (from === 'lowPriority' && to !== 'lowPriority' && facts.priority === 'LOW') patch.priority = null
  if (to === 'paused' && facts.pausedAt === null) patch.pausedAt = now
  if (to === 'lowPriority' && facts.priority !== 'LOW') patch.priority = 'LOW'
  if (to === 'nextYear' && !ruleMatches('nextYear', facts, now.getUTCFullYear()))
    patch.planMonth = monthDate(now.getUTCFullYear() + 1, 0)
  if (toTrello !== null) patch.trelloListId = toTrello
  else if (fromTrello !== null) patch.trelloListId = null
  return patch
}
