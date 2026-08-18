/**
 * Expands a "from – to" date range into the list of ISO days for which
 * schedule entries are created (one ScheduleEntry per day — the rest of the
 * system stays day-based). Pure, testable.
 */
export const MAX_RANGE_DAYS = 31

const ISO = /^\d{4}-\d{2}-\d{2}$/

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

export function isWeekendIso(iso: string): boolean {
  const d = toUtc(iso).getUTCDay()
  return d === 0 || d === 6
}

export function isSaturdayIso(iso: string): boolean {
  return toUtc(iso).getUTCDay() === 6
}

export function isSundayIso(iso: string): boolean {
  return toUtc(iso).getUTCDay() === 0
}

/** Which weekend days a "from – to" range actually contains. */
export function weekendDaysInRange(start: string, end: string | null | undefined): { saturday: boolean; sunday: boolean } {
  const all = rawDays(start, end)
  return { saturday: all.some(isSaturdayIso), sunday: all.some(isSundayIso) }
}

function rawDays(start: string, end: string | null | undefined): string[] {
  if (!ISO.test(start)) return []
  if (!end || end === start) return [start]
  if (!ISO.test(end)) return []
  const s = toUtc(start).getTime()
  const e = toUtc(end).getTime()
  if (e < s) return []
  const days = Math.round((e - s) / 86_400_000) + 1
  if (days > MAX_RANGE_DAYS) return []
  return Array.from({ length: days }, (_, i) => new Date(s + i * 86_400_000).toISOString().slice(0, 10))
}

export type RangeOptions = {
  /** Plan Saturdays inside the range (default false). */
  saturday?: boolean
  /** Plan Sundays inside the range (default false). */
  sunday?: boolean
}

export type RangeResult = { dates: string[]; error?: 'invalidRange' | 'rangeTooLong' | 'noWorkingDays' }

/**
 * Returns every day from `start` to `end` (inclusive). Without `end` (or
 * end === start) it is just `[start]` — a single day is always kept, even on a
 * weekend. Inside a range, Saturdays and Sundays are only included when the
 * matching option is set. Ranges running backwards or beyond MAX_RANGE_DAYS
 * are rejected.
 */
export function expandDateRange(start: string, end: string | null | undefined, options: RangeOptions = {}): RangeResult {
  if (!ISO.test(start)) return { dates: [], error: 'invalidRange' }
  if (!end || end === start) return { dates: [start] }
  if (!ISO.test(end)) return { dates: [], error: 'invalidRange' }
  const s = toUtc(start).getTime()
  const e = toUtc(end).getTime()
  if (e < s) return { dates: [], error: 'invalidRange' }
  const days = Math.round((e - s) / 86_400_000) + 1
  if (days > MAX_RANGE_DAYS) return { dates: [], error: 'rangeTooLong' }
  const dates = rawDays(start, end).filter(
    (iso) => (!isSaturdayIso(iso) || options.saturday === true) && (!isSundayIso(iso) || options.sunday === true)
  )
  if (dates.length === 0) return { dates: [], error: 'noWorkingDays' }
  return { dates }
}
