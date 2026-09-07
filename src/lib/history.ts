// Where the old data ends and the working data begins.
//
// A company that starts with BauCrew brings years of finished work with it —
// imported cards, jobs that were done before anybody typed anything here.
// Those will never get a start date or an order value, and asking for them
// forever makes the data-quality page useless. So the office names one day:
// work that was finished before it is HISTORY. It is still there, still
// searchable, still counted where the figures come from the planning sheet —
// it is simply not something anybody is asked to complete.
//
// Nothing else changes: open work is asked about whatever its date, and no
// total anywhere is computed from this.

/** Statuses that mean the work is behind us. */
const DONE = new Set(['COMPLETED', 'INVOICED', 'PAID'])

export type HistoryProject = {
  status: string
  plannedStart: Date | null
  plannedEnd: Date | null
  actualStart: Date | null
  actualEnd: Date | null
  /** When the source record was made — a board card's own date. */
  sourceCreatedAt: Date | null
}

/**
 * The day a project is filed under, best first: when it actually ended,
 * else when it was meant to, else when it started, else when its card was
 * made. `createdAt` is deliberately not among them — a bulk import stamps
 * every row with the day of the import, which says nothing about the work.
 */
export function projectHistoryDate(p: HistoryProject): Date | null {
  return p.actualEnd ?? p.plannedEnd ?? p.actualStart ?? p.plannedStart ?? p.sourceCreatedAt
}

/**
 * Whether a project belongs to the old data: finished, and finished before
 * the cutoff. Without a cutoff nothing is history. A finished project with
 * no date at all is not history either — nobody can say when it was, so it
 * stays on the list until somebody says.
 */
export function isHistorical(p: HistoryProject, cutoff: Date | null): boolean {
  if (!cutoff || !DONE.has(p.status)) return false
  const date = projectHistoryDate(p)
  return date !== null && date.getTime() < cutoff.getTime()
}

/** The setting as it is stored, or an empty string when it is not set. */
export const formatHistoryCutoff = (cutoff: Date | null): string =>
  cutoff ? cutoff.toISOString().slice(0, 10) : ''

/**
 * Reads the stored setting: a plain YYYY-MM-DD, or nothing. A date that is
 * not a day of the calendar is refused rather than rolled over — the 31st of
 * February must not quietly become the 3rd of March.
 */
export function parseHistoryCutoff(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  return formatHistoryCutoff(date) === value ? date : null
}
