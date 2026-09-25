/**
 * Where a job stands in the year: the month it runs in, and how many months
 * it runs. This is what the Planumsatz files a project under, what a card
 * dragged into another month changes, and what the two planning fields on a
 * project mean.
 *
 * - A **planned start** is a fixed day; its month is the job's month. Where
 *   the office has not fixed a day yet, the **planMonth** — the month the work
 *   is expected in, kept as that month's first day — places the job. A fixed
 *   day always wins over the rough placing, so a project can never say two
 *   different things about where it stands.
 * - With a planned start and a planned end the job runs over every month
 *   between them; without an end it runs `planMonths` months from its first.
 *   Its order value is spread evenly over those months, so a job that runs
 *   from October into December counts a third in each.
 * - Moving a job into another month shifts its fixed days by whole months —
 *   the 15th stays the 15th — and places it there; a job without fixed days
 *   is simply placed.
 *
 * Pure, so the rules are tested without a database. Months are 0–11 and dates
 * are UTC days, like every planning date in the app.
 */

export type PlanDates = {
  plannedStart: Date | null
  plannedEnd: Date | null
  planMonth: Date | null
  planMonths: number
}

/** A month of a year; `month` is 0–11. */
export type MonthKey = { year: number; month: number }

/** The longest a job is spread: two years of months. */
export const MAX_PLAN_MONTHS = 24

export const monthKey = (d: Date): MonthKey => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() })

/** The first day of a month, as the planning fields keep it. */
export const monthDate = (year: number, month: number): Date => new Date(Date.UTC(year, month, 1))

const index = (k: MonthKey) => k.year * 12 + k.month

const at = (i: number): MonthKey => ({ year: Math.floor(i / 12), month: ((i % 12) + 12) % 12 })

/** How many months from `a` to `b`: 0 in the same month, negative going back. */
export const monthsBetween = (a: MonthKey, b: MonthKey): number => index(b) - index(a)

const clampMonths = (n: number) => (Number.isFinite(n) ? Math.min(MAX_PLAN_MONTHS, Math.max(1, Math.round(n))) : 1)

/**
 * The first month the job runs in: the planned start's, else the month the
 * office placed it in. Null when it has neither — the job belongs to no
 * month yet.
 */
export function firstMonth(p: PlanDates): MonthKey | null {
  if (p.plannedStart) return monthKey(p.plannedStart)
  if (p.planMonth) return monthKey(p.planMonth)
  return null
}

/**
 * How many months the job runs: from its planned start to its planned end,
 * else the office's count. At least one, never more than MAX_PLAN_MONTHS.
 */
export function monthCount(p: PlanDates): number {
  if (p.plannedStart && p.plannedEnd && p.plannedEnd.getTime() >= p.plannedStart.getTime()) {
    return clampMonths(monthsBetween(monthKey(p.plannedStart), monthKey(p.plannedEnd)) + 1)
  }
  return clampMonths(p.planMonths)
}

/** Every month the job runs in, first to last; empty when it has no month. */
export function monthSpan(p: PlanDates): MonthKey[] {
  const first = firstMonth(p)
  if (!first) return []
  const start = index(first)
  return Array.from({ length: monthCount(p) }, (_, i) => at(start + i))
}

/** The job's months (0–11) that fall in `year`, in order. */
export function monthsInYear(p: PlanDates, year: number): number[] {
  return monthSpan(p)
    .filter((k) => k.year === year)
    .map((k) => k.month)
}

/**
 * An amount spread evenly over `n` months, in cents, the odd cents on the
 * last — so the shares add up to the amount exactly, month after month.
 */
export function spreadAmount(amount: number, n: number): number[] {
  const parts = Math.max(1, Math.round(n))
  const cents = Math.round(amount * 100)
  const base = Math.trunc(cents / parts)
  const shares = Array.from({ length: parts }, () => base)
  shares[parts - 1] += cents - base * parts
  return shares.map((c) => c / 100)
}

/**
 * A day moved by whole months. The day of the month is kept where the new
 * month has it, else it is the new month's last day — the 31st of October
 * moved a month lands on the 30th of November.
 */
export function addMonths(date: Date, delta: number): Date {
  const k = at(index(monthKey(date)) + delta)
  const lastDay = new Date(Date.UTC(k.year, k.month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(k.year, k.month, Math.min(date.getUTCDate(), lastDay)))
}

/**
 * What moving a job into `target` writes: its fixed days shifted by the whole
 * months between where it stood and where it goes, and the placing itself —
 * so a job with a planned start keeps its day of the month, and one without
 * is placed and nothing else changes.
 */
export function movedTo(p: PlanDates, target: MonthKey): { plannedStart: Date | null; plannedEnd: Date | null; planMonth: Date } {
  const first = firstMonth(p)
  const delta = first ? monthsBetween(first, target) : 0
  return {
    plannedStart: p.plannedStart ? addMonths(p.plannedStart, delta) : null,
    plannedEnd: p.plannedStart && p.plannedEnd ? addMonths(p.plannedEnd, delta) : p.plannedEnd,
    planMonth: monthDate(target.year, target.month),
  }
}

/** Whether a line of the Planumsatz may be dragged into another month: a project — never a sheet line, which has none. */
export const movable = (line: { fromSheet?: boolean }): boolean => !line.fromSheet

/** "2026-10" for a month field, or '' when there is none. */
export const monthInputValue = (d: Date | null): string =>
  d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` : ''

/** The month a month field named, as the planning fields keep it — or null for anything else. */
export function parseMonthInput(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return monthDate(Number(m[1]), month - 1)
}
