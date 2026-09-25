/**
 * Lists that hold only some of a status's cards, the way the client's Trello
 * board had them: "Pause" beside "Baustelle läuft", "Aufträge für nächstes
 * Jahr" beside "Aufträge", a waiting list of the small jobs, the running
 * sites whose first invoice went out. A column is still a status — that is
 * what dragging into it sets — but it may carry a rule as well, and then it
 * shows the cards of its status that the rule picks, while the plain column
 * of the same status shows the rest.
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
  const ruled = own.find((c) => {
    const rule = columnRuleKey(c.rule)
    return rule !== null && ruleMatches(rule, facts, currentYear)
  })
  return ruled ?? own.find((c) => !columnRuleKey(c.rule)) ?? null
}

/** The changes a drop makes beyond the status: what the rule left behind undone, what the new one asks for. */
export type RulePatch = { pausedAt?: Date | null; priority?: string | null; planMonth?: Date | null }

/**
 * What dragging a card from one column into another does to it, beyond the
 * status — or 'refused' where the rule is not a drag's to set. Leaving a
 * rule column undoes its rule, except next year's list: the dates are the
 * office's, and the card simply goes where they put it. Dropping into next
 * year's list places the job in January of next year — a rough month, not
 * a fixed day — unless it stands in a later year already.
 */
export function dropPatch(
  from: ColumnRule | null,
  to: ColumnRule | null,
  facts: RuleFacts,
  now: Date
): RulePatch | 'refused' {
  if (to === 'invoice1') return 'refused'
  const patch: RulePatch = {}
  if (from === 'paused' && to !== 'paused') patch.pausedAt = null
  if (from === 'lowPriority' && to !== 'lowPriority' && facts.priority === 'LOW') patch.priority = null
  if (to === 'paused' && facts.pausedAt === null) patch.pausedAt = now
  if (to === 'lowPriority' && facts.priority !== 'LOW') patch.priority = 'LOW'
  if (to === 'nextYear' && !ruleMatches('nextYear', facts, now.getUTCFullYear()))
    patch.planMonth = monthDate(now.getUTCFullYear() + 1, 0)
  return patch
}
