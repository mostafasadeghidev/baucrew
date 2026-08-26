// Pure logic — no server-only import so it can be unit-tested directly.

export type TimeInterval = { startedAt: Date; endedAt: Date | null }

/** Minutes of one interval; an open one counts up to `now`. Never negative. */
export function entryMinutes(entry: TimeInterval, now: Date): number {
  const end = entry.endedAt ?? now
  const ms = end.getTime() - entry.startedAt.getTime()
  return ms > 0 ? Math.round(ms / 60000) : 0
}

export function sumMinutes(entries: TimeInterval[], now: Date): number {
  return entries.reduce((sum, e) => sum + entryMinutes(e, now), 0)
}

/** 450 → "7:30". Hours can exceed 24 (project totals). */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * An interval may only be saved when it is plausible: start before end,
 * not longer than 16 hours (a forgotten stop is corrected by the office).
 */
export function validInterval(startedAt: Date, endedAt: Date): boolean {
  const ms = endedAt.getTime() - startedAt.getTime()
  return ms > 0 && ms <= 16 * 60 * 60 * 1000
}
