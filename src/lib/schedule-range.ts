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

export type RangeResult = { dates: string[]; error?: 'invalidRange' | 'rangeTooLong' | 'noWorkingDays' }

/**
 * Returns every day from `start` to `end` (inclusive). Without `end` (or
 * end === start) it's just `[start]`. Weekend days are dropped when
 * `skipWeekends` is set. Ranges running backwards or beyond MAX_RANGE_DAYS are
 * rejected.
 */
export function expandDateRange(start: string, end: string | null | undefined, skipWeekends: boolean): RangeResult {
  if (!ISO.test(start)) return { dates: [], error: 'invalidRange' }
  if (!end || end === start) return { dates: [start] }
  if (!ISO.test(end)) return { dates: [], error: 'invalidRange' }
  const s = toUtc(start).getTime()
  const e = toUtc(end).getTime()
  if (e < s) return { dates: [], error: 'invalidRange' }
  const days = Math.round((e - s) / 86_400_000) + 1
  if (days > MAX_RANGE_DAYS) return { dates: [], error: 'rangeTooLong' }
  const dates: string[] = []
  for (let i = 0; i < days; i++) {
    const iso = new Date(s + i * 86_400_000).toISOString().slice(0, 10)
    if (skipWeekends && isWeekendIso(iso)) continue
    dates.push(iso)
  }
  if (dates.length === 0) return { dates: [], error: 'noWorkingDays' }
  return { dates }
}
