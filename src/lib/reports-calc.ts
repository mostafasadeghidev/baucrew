/**
 * Pure report calculations (no DB, no React) — unit-tested.
 */

/** Weekdays (Mon–Fri) between two UTC dates, inclusive. Null if either is missing or end < start. */
export function businessDaysBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  if (e < s) return null
  let days = 0
  for (let t = s; t <= e; t += 86_400_000) {
    const dow = new Date(t).getUTCDay()
    if (dow !== 0 && dow !== 6) days++
  }
  return days
}

/** Calendar days from a to b (b − a); null if either missing. */
export function daysDiff(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null
  const s = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())
  const e = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
  return Math.round((e - s) / 86_400_000)
}

export type EfficiencyInput = {
  price: number | null
  plannedStart: Date | null
  plannedEnd: Date | null
  actualStart: Date | null
  actualEnd: Date | null
  /** One item per schedule entry: its date and how many employees were on it. */
  entries: Array<{ date: Date; employeeCount: number }>
}

export type EfficiencyResult = {
  /** Planned working days (Mon–Fri) between plannedStart and plannedEnd. */
  plannedDays: number | null
  /** Distinct days with at least one schedule entry. */
  actualDays: number
  /** Sum of employees over all schedule entries. */
  personDays: number
  /** price ÷ personDays; null when either is missing/zero. */
  revenuePerPersonDay: number | null
  /** actualEnd − plannedEnd in calendar days (positive = late); null if unknown. */
  delayDays: number | null
  /** actualDays − plannedDays; null if plannedDays unknown. */
  dayDelta: number | null
}

export function computeEfficiency(p: EfficiencyInput): EfficiencyResult {
  const plannedDays = businessDaysBetween(p.plannedStart, p.plannedEnd)
  const dayKeys = new Set(p.entries.map((e) => e.date.toISOString().slice(0, 10)))
  const actualDays = dayKeys.size
  const personDays = p.entries.reduce((sum, e) => sum + e.employeeCount, 0)
  const revenuePerPersonDay =
    p.price != null && personDays > 0 ? Math.round(p.price / personDays) : null
  return {
    plannedDays,
    actualDays,
    personDays,
    revenuePerPersonDay,
    delayDays: daysDiff(p.plannedEnd, p.actualEnd),
    dayDelta: plannedDays != null ? actualDays - plannedDays : null,
  }
}

/** Percent change from `previous` to `current`; null when previous is 0/absent. */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}

/**
 * Sum of monthly totals up to and including `throughMonth` (0-11). Used to
 * compare "year to date" against the same months of the previous year.
 */
export function sumThroughMonth(monthTotals: number[], throughMonth: number): number {
  return monthTotals.slice(0, Math.max(0, Math.min(11, throughMonth)) + 1).reduce((a, b) => a + b, 0)
}

// ── Quarters ───────────────────────────────────────────────────────────

export type QuarterCompare = { year: number; total: number; percent: number | null }

export type QuarterRow = {
  /** 0-3. */
  index: number
  total: number
  /** Of the whole year, 0..1; 0 when the year is empty. */
  share: number
  /** The same quarter of each year given, in the order they were given. */
  compare: QuarterCompare[]
}

/**
 * The year's twelve months folded into four quarters, each one set against the
 * same quarter of every year the office asked to compare with.
 *
 * Quarter against the same quarter, never against the year on screen as a
 * whole: three winter months are not a fourth of the year's work anywhere in
 * this trade, and measuring them against a yearly average would say every
 * winter is a bad one.
 */
export function quarterBreakdown(
  months: number[],
  compare: Array<{ year: number; months: number[] }> = []
): QuarterRow[] {
  const quarterOf = (values: number[], q: number) =>
    values.slice(q * 3, q * 3 + 3).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0)
  const totals = [0, 1, 2, 3].map((q) => quarterOf(months, q))
  const yearTotal = totals.reduce((sum, v) => sum + v, 0)
  return totals.map((total, index) => ({
    index,
    total,
    share: yearTotal > 0 ? total / yearTotal : 0,
    compare: compare.map((other) => {
      const otherTotal = quarterOf(other.months, index)
      return { year: other.year, total: otherTotal, percent: percentChange(total, otherTotal) }
    }),
  }))
}

/**
 * The quarter with the most in it. Null when the year is empty — there is no
 * "best" quarter of a year in which nothing was earned, and a card that named
 * one would be inventing it.
 */
export function bestQuarter(rows: QuarterRow[]): QuarterRow | null {
  let best: QuarterRow | null = null
  for (const row of rows) if (row.total > 0 && (!best || row.total > best.total)) best = row
  return best
}

// ── Period selection (whole year, quarter, half-year, single month) ─────

export type MonthRange = { from: number; to: number } // 0-11 inclusive

/**
 * Parses the `period` query value: "" → whole year (null), "1".."12" → month,
 * "q1".."q4" → quarter, "h1"/"h2" → half-year. Anything else → null.
 */
export function parsePeriod(value: string | undefined | null): MonthRange | null {
  if (!value) return null
  const v = value.toLowerCase()
  if (/^(1[0-2]|[1-9])$/.test(v)) {
    const m = Number(v) - 1
    return { from: m, to: m }
  }
  const q = /^q([1-4])$/.exec(v)
  if (q) {
    const i = Number(q[1]) - 1
    return { from: i * 3, to: i * 3 + 2 }
  }
  const h = /^h([12])$/.exec(v)
  if (h) {
    const i = Number(h[1]) - 1
    return { from: i * 6, to: i * 6 + 5 }
  }
  return null
}

/** Sum of monthly values inside the range (whole array when range is null). */
export function sumRange(monthValues: number[], range: MonthRange | null): number {
  const from = range?.from ?? 0
  const to = range?.to ?? 11
  return monthValues.slice(from, to + 1).reduce((a, b) => a + b, 0)
}

/**
 * Working days (Mon–Fri) of a period, capped at `today` when the period is
 * still running — the denominator for utilisation percentages.
 */
export function workingDaysInPeriod(year: number, range: MonthRange | null, today: Date): number {
  const start = new Date(Date.UTC(year, range?.from ?? 0, 1))
  const endExclusive = new Date(Date.UTC(year, (range?.to ?? 11) + 1, 1))
  const cap = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1))
  const end = endExclusive < cap ? endExclusive : cap
  if (end <= start) return 0
  return businessDaysBetween(start, new Date(end.getTime() - 86_400_000)) ?? 0
}

/** Utilisation bucket for highlighting: low (< 50 %), high (> 90 %), or normal. */
export function utilizationLevel(pct: number | null): 'low' | 'high' | 'normal' | null {
  if (pct == null) return null
  if (pct < 50) return 'low'
  if (pct > 90) return 'high'
  return 'normal'
}

export type PlanGapRow = { month: number | null }

/**
 * Splits the plan lines that have no project into the ones still ahead and
 * the ones behind. A line for a month that is over is a record of what was
 * planned back then, not a job for anybody; a line for this month or a later
 * one is work that still has to become a project. A line the sheet parked on
 * the year without a month counts as ahead while the year is not over.
 */
export function splitPlanGaps<T extends PlanGapRow>(
  rows: T[],
  year: number,
  today: Date
): { upcoming: T[]; past: T[] } {
  const thisYear = today.getUTCFullYear()
  const thisMonth = today.getUTCMonth() + 1
  const ahead = (row: T) => {
    if (year > thisYear) return true
    if (year < thisYear) return false
    return row.month === null || row.month >= thisMonth
  }
  return { upcoming: rows.filter(ahead), past: rows.filter((r) => !ahead(r)) }
}

/** One name standing in a month of the revenue tab. */
export type SiteRow = {
  /** The project's id; for a sheet line with no project, the line's own id. */
  id: string
  number: string
  name: string
  customer: string
  price: number | null
  /** True for a line of the planning sheet that no project is tied to. */
  fromSheet?: boolean
}

export type SiteMonth = { month: number; own: SiteRow[]; sub: SiteRow[] }

export type TopSite = {
  key: string
  /** The project to open, or null when only the sheet knows this site. */
  id: string | null
  number: string
  name: string
  customer: string
  total: number
  /** How many month lines add up to that total. */
  lines: number
}

/**
 * The biggest sites of a period: every line of every month folded onto the
 * project it belongs to, largest first. A project spread over four months
 * reads as one job worth the sum of its four lines, which is how the office
 * talks about it.
 *
 * A sheet line with no project has no id to fold on — two lines of the same
 * name are the same site, so the name is the key. Lines with no amount count
 * as zero rather than being dropped: the site was worked on.
 */
export function topSites(months: SiteMonth[], range: MonthRange | null): TopSite[] {
  const byKey = new Map<string, TopSite>()
  for (const month of months) {
    if (range && (month.month < range.from || month.month > range.to)) continue
    for (const row of [...month.own, ...month.sub]) {
      const key = siteKey(row)
      const found = byKey.get(key)
      if (found) {
        found.total += row.price ?? 0
        found.lines += 1
        continue
      }
      byKey.set(key, {
        key,
        id: row.fromSheet ? null : row.id,
        number: row.number,
        name: row.name,
        customer: row.customer,
        total: row.price ?? 0,
        lines: 1,
      })
    }
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

/**
 * The key a site folds on, wherever sites are folded: a project on its id, and
 * a sheet line with no project on its name — two lines of the same name are
 * the same site.
 */
export const siteKey = (row: SiteRow): string =>
  row.fromSheet ? `sheet:${row.name.trim().toLowerCase()}` : `project:${row.id}`

/** How many sites stand in a month, own and SUB together — a site once, however many lines it has. */
export const monthSiteCount = (month: Pick<SiteMonth, 'own' | 'sub'>): number =>
  new Set([...month.own, ...month.sub].map(siteKey)).size

/** What one site brought in one month, split by who did the work. */
export type SiteCell = { own: number; sub: number }

export type SiteMonthRow = {
  key: string
  /** The project to open, or null when only the sheet knows this site. */
  id: string | null
  number: string
  name: string
  customer: string
  /** By month (0–11); a month the site does not stand in has no entry. */
  cells: Record<number, SiteCell>
  /** The months it stands in, in the order the months are shown. */
  span: number[]
  total: number
}

/**
 * Every site of the shown months against those months: the rows of the year
 * matrix, and the span the lanes print on each tile ("month 2 of 3").
 *
 * Sites fold as in `topSites`. `order` is the months as the tab shows them —
 * the period and the chosen direction already applied — and a month outside it
 * is not counted. Rows run the way the months are read: by the first month a
 * site stands in, and within one month the bigger site first, so a year of
 * jobs reads as a staircase.
 */
export function siteMonthRows(months: SiteMonth[], order: number[]): SiteMonthRow[] {
  const position = new Map(order.map((month, i) => [month, i]))
  const byKey = new Map<string, SiteMonthRow>()

  const add = (month: number, row: SiteRow, who: keyof SiteCell) => {
    const key = siteKey(row)
    let site = byKey.get(key)
    if (!site) {
      site = {
        key,
        id: row.fromSheet ? null : row.id,
        number: row.number,
        name: row.name,
        customer: row.customer,
        cells: {},
        span: [],
        total: 0,
      }
      byKey.set(key, site)
    }
    const cell = (site.cells[month] ??= { own: 0, sub: 0 })
    cell[who] += row.price ?? 0
    site.total += row.price ?? 0
  }

  for (const month of months) {
    if (!position.has(month.month)) continue
    for (const row of month.own) add(month.month, row, 'own')
    for (const row of month.sub) add(month.month, row, 'sub')
  }

  const rows = [...byKey.values()]
  for (const row of rows) row.span = order.filter((month) => month in row.cells)
  const start = (row: SiteMonthRow) => position.get(row.span[0]) ?? 0
  return rows.sort((a, b) => start(a) - start(b) || b.total - a.total || a.name.localeCompare(b.name))
}

/**
 * How strongly a cell of the matrix is shaded, from 0 to `steps` − 1. By the
 * square root of its share of the biggest cell, so a small month still reads
 * as more than nothing beside a big one.
 */
export function heatLevel(value: number, max: number, steps: number): number {
  if (value <= 0 || max <= 0) return 0
  return Math.min(steps - 1, Math.floor(Math.sqrt(Math.min(value / max, 1)) * steps))
}

/**
 * Actual against plan, as the difference is written. The plan counts as
 * reached when the actual is at least the plan — or when the shortfall is too
 * small to show in the figures it is written in: "−0 €" on a card of whole
 * euros would be a warning about nothing.
 */
export function planReached(
  actual: number,
  planned: number,
  format: (v: number) => string
): { reached: boolean; diff: number; label: string } {
  const diff = actual - planned
  const reached = diff >= 0 || format(Math.abs(diff)) === format(0)
  return { reached, diff, label: `${reached ? '+' : '−'}${format(Math.abs(diff))}` }
}

export type CumulativeRow = {
  month: number
  total: number
  /** The period's revenue up to and including this month. */
  running: number
  /** The same for the year before, or null when that year is unknown. */
  prevRunning: number | null
  /** running − prevRunning; null when there is nothing to compare against. */
  delta: number | null
}

/**
 * The period month by month with its running total beside the same months of
 * the year before — the answer to "are we ahead of last year, and since
 * when". Counting starts at the first month of the period, not of the year,
 * so a quarter compares against that same quarter.
 */
export function cumulativeMonths(
  months: Array<{ month: number; total: number }>,
  previous: Array<{ month: number; total: number }> | null,
  range: MonthRange | null
): CumulativeRow[] {
  const inRange = (m: number) => !range || (m >= range.from && m <= range.to)
  let running = 0
  let prevRunning = 0
  const rows: CumulativeRow[] = []
  for (const m of months) {
    if (!inRange(m.month)) continue
    running += m.total
    const before = previous?.find((p) => p.month === m.month)
    if (previous) prevRunning += before?.total ?? 0
    rows.push({
      month: m.month,
      total: m.total,
      running,
      prevRunning: previous ? prevRunning : null,
      delta: previous ? running - prevRunning : null,
    })
  }
  return rows
}

/**
 * The years the monthly chart lays beside the one on screen, read from the
 * `compare` URL parameter.
 *
 * Absent means the year before — what the card has always shown. An empty
 * value means the office took that one away and wants the year on its own,
 * which is why "nothing chosen" and "not chosen yet" cannot be the same. Only
 * years the year picker offers are accepted, the year itself is never its own
 * comparison, and the list is capped at as many as the picker offers — past
 * six bars a month a reader stops telling them apart.
 */
export function parseCompareYears(
  value: string | undefined,
  year: number,
  allowed: number[],
  max = 5
): number[] {
  const pick = (years: number[]) =>
    [...new Set(years)]
      .filter((y) => y !== year && allowed.includes(y))
      .sort((a, b) => b - a)
      .slice(0, max)
  if (value === undefined) return pick([year - 1])
  if (value.trim() === '') return []
  return pick(
    value
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isInteger(n))
  )
}

/** A line of the revenue tab as the customer split reads it. */
export type CustomerLine = {
  id: string
  customerId?: string | null
  customer: string
  price: number | null
  fromSheet?: boolean
}

export type CustomerTotal = {
  /** Null for the row of lines that belong to no job, and so to no customer. */
  id: string | null
  name: string
  total: number
  /** Distinct jobs behind the total. */
  jobs: number
  share: number
}

/**
 * The Planumsatz of a period split by customer — the same lines and the same
 * total as the months above it, so the shares add up to the figure the tab
 * opens with. A sheet line with no job belongs to no customer and gets a row of
 * its own rather than dropping out of the sum.
 */
export function customerTotals(
  months: Array<{ month: number; own: CustomerLine[]; sub: CustomerLine[] }>,
  range: MonthRange | null
): { rows: CustomerTotal[]; total: number } {
  const byCustomer = new Map<string | null, { row: CustomerTotal; jobs: Set<string> }>()
  let total = 0
  for (const month of months) {
    if (range && (month.month < range.from || month.month > range.to)) continue
    for (const line of [...month.own, ...month.sub]) {
      const key = line.fromSheet || !line.customerId ? null : line.customerId
      const entry = byCustomer.get(key) ?? {
        row: { id: key, name: key === null ? '' : line.customer, total: 0, jobs: 0, share: 0 },
        jobs: new Set<string>(),
      }
      entry.row.total += line.price ?? 0
      entry.jobs.add(key === null ? line.customer || line.id : line.id)
      total += line.price ?? 0
      byCustomer.set(key, entry)
    }
  }
  const rows = [...byCustomer.values()]
    .map(({ row, jobs }) => ({ ...row, jobs: jobs.size, share: total > 0 ? Math.round((row.total / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  return { rows, total }
}

/** Customers of the same period a year earlier with nothing in this one, the biggest first. */
export function lostCustomers(current: CustomerTotal[], previous: CustomerTotal[]): CustomerTotal[] {
  const stillHere = new Set(current.filter((r) => r.id !== null && r.total > 0).map((r) => r.id))
  return previous
    .filter((r) => r.id !== null && r.total > 0 && !stillHere.has(r.id))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}
