/**
 * Which year a project belongs to, for the year picker on the projects page.
 * The picker takes one year, several (2025 and 2026 together), or every year;
 * a project is shown when it belongs to any of the years ticked.
 *
 * A project belongs to every year its work touches: from its earliest date to
 * its latest — planned or actual, start or end — so a job planned for December
 * that ran into January is found under both years. A project with no date at
 * all belongs to the year it came into being: its board card's own date when
 * it was imported, else the day it was typed in.
 *
 * A project also belongs to every year its status was changed in. Moving a card
 * on this year's board is this year's work: a job from last year that is marked
 * finished or cancelled today must not vanish from the column it was just
 * dropped into.
 *
 * The running year also holds every project that is still open, whatever its
 * dates say. It is the year the office works in, and an order from last year
 * that is not finished, or an accepted offer for next spring, is today's work —
 * hiding it behind another year would make it look done.
 *
 * Pure, so the rule is tested without a database.
 */

/** Statuses of work that is not behind us yet. */
const OPEN = new Set(['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS'])

/** The picker's value for "every year". */
export const ALL_YEARS = 'all'

/** The years ticked, newest first — never empty — or every year. */
export type YearSelection = number[] | typeof ALL_YEARS

export type YearProject = {
  status: string
  plannedStart: Date | null
  plannedEnd: Date | null
  actualStart: Date | null
  actualEnd: Date | null
  /** The month the office placed the job in, when no start is fixed. */
  planMonth?: Date | null
  /** When the source record was made — a board card's own date. */
  sourceCreatedAt: Date | null
  createdAt: Date
  /** The years the project's status was changed in, from the audit log. */
  statusChangedYears?: number[]
}

/** The first and last year a project's work touches. */
export function projectYearSpan(p: YearProject): { from: number; to: number } {
  const dates = [p.plannedStart, p.plannedEnd, p.actualStart, p.actualEnd, p.planMonth ?? null].filter((d): d is Date => d !== null)
  if (dates.length === 0) {
    const year = (p.sourceCreatedAt ?? p.createdAt).getUTCFullYear()
    return { from: year, to: year }
  }
  const years = dates.map((d) => d.getUTCFullYear())
  return { from: Math.min(...years), to: Math.max(...years) }
}

export function belongsToYear(p: YearProject, year: number, currentYear: number): boolean {
  if (year === currentYear && OPEN.has(p.status)) return true
  if (p.statusChangedYears?.includes(year)) return true
  const span = projectYearSpan(p)
  return span.from <= year && year <= span.to
}

export function belongsToYears(p: YearProject, years: number[], currentYear: number): boolean {
  return years.some((year) => belongsToYear(p, year, currentYear))
}

/** Newest first, each once. */
const newestFirst = (years: number[]) => [...new Set(years)].sort((a, b) => b - a)

/**
 * What the address asks for: every year, or the years in a comma list
 * ("2026,2025"). Nothing, or nothing that is a year, is the running year —
 * the page opens there.
 */
export function parseProjectYears(value: string | string[] | undefined, currentYear: number): YearSelection {
  // "?year=2025&year=2026" arrives as a list; it means the same as "2025,2026".
  const text = Array.isArray(value) ? value.join(',') : (value ?? '')
  if (text === ALL_YEARS) return ALL_YEARS
  const years = text
    .split(',')
    .map((part) => part.trim())
    // No leading zero: "0999" would be a year the picker cannot show.
    .filter((part) => /^[1-9]\d{3}$/.test(part))
    .map(Number)
  return years.length > 0 ? newestFirst(years) : [currentYear]
}

/**
 * How a selection is written into the address. The running year alone is
 * where the page opens anyway, so it is written as nothing — the address a
 * link to the projects page already has.
 */
export function projectYearsParam(selection: YearSelection, currentYear: number): string | null {
  if (selection === ALL_YEARS) return ALL_YEARS
  const years = newestFirst(selection)
  if (years.length === 0 || (years.length === 1 && years[0] === currentYear)) return null
  return years.join(',')
}

/**
 * Ticking a year in the picker. From "every year" a tick starts a fresh
 * choice of that one year. Untick the last year and nothing happens: a page
 * of no year at all is not a choice anybody means to make — "Alle Jahre" is
 * one click away for the other direction.
 */
export function toggleProjectYear(selection: YearSelection, year: number): YearSelection {
  if (selection === ALL_YEARS) return [year]
  if (!selection.includes(year)) return newestFirst([...selection, year])
  return selection.length === 1 ? selection : selection.filter((y) => y !== year)
}

/** How far a mistyped date may stretch the list of years. */
const YEARS_BACK = 20
const YEARS_AHEAD = 5

/**
 * The years the picker offers, newest first: every year some project touches,
 * and always the running year and the ones the page stands on. A date typed as
 * 1926 instead of 2026 would otherwise fill the list with a century of empty
 * years, so the list keeps to a sensible window around today.
 */
export function projectYearOptions(projects: YearProject[], currentYear: number, selected: number[] = []): number[] {
  const years = new Set<number>([currentYear, ...selected])
  const low = currentYear - YEARS_BACK
  const high = currentYear + YEARS_AHEAD
  for (const p of projects) {
    const span = projectYearSpan(p)
    for (let y = Math.max(span.from, low); y <= Math.min(span.to, high); y++) years.add(y)
    for (const y of p.statusChangedYears ?? []) if (y >= low && y <= high) years.add(y)
  }
  return [...years].sort((a, b) => b - a)
}
