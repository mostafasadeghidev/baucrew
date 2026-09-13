/**
 * The CRM's Datenlücken tab: the missing and contradictory entries that make a
 * figure on the other tabs wrong or incomplete.
 *
 * It is one list with one count. The Heute tile, the tab's badge and the
 * signpost next to the Planumsatz all show that same count, so the office never
 * meets three numbers for one thing. Only real data errors belong here —
 * something to type in or correct. Operational questions (a site with no
 * appointment, material still missing, an offer nobody chased) are on Heute,
 * where they are work, not bookkeeping.
 *
 * Old data before the history cutoff is not asked about; it is counted in a
 * footnote.
 *
 * Pure, so the rules are tested without a database.
 */

/** A job as the gap checks read it. */
export type GapProject = {
  id: string
  number: string
  name: string
  customer: string
  status: string
  /** Price plus Nachträge; null when neither is entered. */
  amount: number | null
  plannedStart: Date | null
  isSub: boolean
  historical: boolean
  /** The planning-sheet lines tied to the job, all years. */
  lines: Array<{ year: number; amount: number; isSub: boolean }>
}

/** A planning-sheet line that belongs to no job — none tied, or its job was cancelled. */
export type LooseLine = { id: string; year: number; month: number | null; name: string; amount: number }

/** A value is asked for from the offer on: an enquiry has none to give yet. */
const ASKED_FOR_VALUE = ['QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID']
/**
 * A start date is asked for from planned work on. An accepted offer that nobody
 * has scheduled yet has no date to give, and saying so every day would make the
 * list impossible to finish — the office's own choice, kept.
 */
const ASKED_FOR_DATE = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID']

export type GapReport = {
  /** A job with no value, or no planned start where it should have one. */
  valueOrDate: Array<{ project: GapProject; valueMissing: boolean; dateMissing: boolean }>
  /** A job whose value and whose sheet lines tell two different amounts. */
  valueVsPlan: Array<{ project: GapProject; planTotal: number; difference: number }>
  /** A job marked own crew while its sheet lines say SUB, or the other way round. */
  subConflict: GapProject[]
  /** A job starting in a year the sheet covers, with no line in that year. */
  notInPlan: Array<{ project: GapProject; year: number }>
  /** Loose sheet lines that are still work to do: from the running month on, later years, or no month yet. */
  looseLines: LooseLine[]
  /** Loose lines of this year's months that are over: a record of what was planned, not a job for anybody. */
  looseLinesPast: { count: number; total: number }
  /** Old jobs with a gap, not asked about. */
  historicalWithGaps: number
  /** Distinct jobs and lines above — the one number shown wherever data gaps are counted. */
  count: number
}

const cents = (value: number) => Math.round(value * 100)

export function dataGapReport(
  projects: GapProject[],
  looseLines: LooseLine[],
  { sheetYears, currentYear, runningMonth }: { sheetYears: number[]; currentYear: number; runningMonth: number }
): GapReport {
  const report: GapReport = {
    valueOrDate: [],
    valueVsPlan: [],
    subConflict: [],
    notInPlan: [],
    looseLines: [],
    looseLinesPast: { count: 0, total: 0 },
    historicalWithGaps: 0,
    count: 0,
  }
  const flagged = new Set<string>()

  for (const p of projects) {
    if (p.status === 'CANCELLED') continue
    const valueMissing = ASKED_FOR_VALUE.includes(p.status) && p.amount === null
    const dateMissing = ASKED_FOR_DATE.includes(p.status) && p.plannedStart === null
    const planTotal = p.lines.reduce((sum, line) => sum + line.amount, 0)
    const valueDiffers = p.amount !== null && p.lines.length > 0 && cents(planTotal) !== cents(p.amount)
    const subDiffers = p.lines.some((line) => line.isSub !== p.isSub)
    const startYear = p.plannedStart?.getUTCFullYear() ?? null
    const missingFromSheet =
      startYear !== null && sheetYears.includes(startYear) && !p.lines.some((line) => line.year === startYear)

    const anything = valueMissing || dateMissing || valueDiffers || subDiffers || missingFromSheet
    if (!anything) continue
    if (p.historical) {
      report.historicalWithGaps += 1
      continue
    }
    flagged.add(p.id)
    if (valueMissing || dateMissing) report.valueOrDate.push({ project: p, valueMissing, dateMissing })
    if (valueDiffers) report.valueVsPlan.push({ project: p, planTotal, difference: planTotal - (p.amount ?? 0) })
    if (subDiffers) report.subConflict.push(p)
    if (missingFromSheet && startYear !== null) report.notInPlan.push({ project: p, year: startYear })
  }

  for (const line of looseLines) {
    const ahead =
      line.year > currentYear || (line.year === currentYear && (line.month === null || line.month - 1 >= runningMonth))
    if (ahead) report.looseLines.push(line)
    // A year that is over is the Planabgleich's archive, not a footnote of today.
    else if (line.year === currentYear) {
      report.looseLinesPast.count += 1
      report.looseLinesPast.total += line.amount
    }
  }

  report.count = flagged.size + report.looseLines.length
  return report
}
