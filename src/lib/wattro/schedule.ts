/**
 * When Wattro is read without anybody clicking. Pure: the clock and the
 * environment come in as arguments, so every rule is tested without either.
 *
 * The server's timer (./timer) looks every few minutes; a run is only made
 * when the interval is up, so a manual click, a restart or a second server
 * cannot make Wattro be read twice in a row.
 */

/** Every hour: fresh enough for "who has the grinder", gentle on Wattro. */
export const DEFAULT_SYNC_INTERVAL_MINUTES = 60

/** Below this Wattro would be read more often than anyone looks. */
export const MIN_SYNC_INTERVAL_MINUTES = 15

/** How often the server's timer looks whether a run is due. */
export const TIMER_TICK_MINUTES = 5

/**
 * The interval from `WATTRO_SYNC_INTERVAL_MINUTES`: 0 turns automatic runs
 * off, anything unreadable falls back to the default, anything shorter than
 * the minimum is raised to it. A development server stays off unless the
 * variable is set — a laptop should not read the client's Wattro on its own.
 */
export function syncIntervalMinutes(raw: string | undefined, production: boolean): number {
  const value = raw?.trim()
  if (!value) return production ? DEFAULT_SYNC_INTERVAL_MINUTES : 0
  const minutes = Number(value)
  if (!Number.isFinite(minutes) || minutes < 0) return DEFAULT_SYNC_INTERVAL_MINUTES
  if (minutes === 0) return 0
  return Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(minutes))
}

/**
 * Whether a run is due. Five minutes of slack: the timer looks every five
 * minutes, and a look a moment before the full hour must not skip a whole
 * hour.
 */
export function isSyncDue(lastAt: Date | null, now: Date, intervalMinutes: number): boolean {
  if (intervalMinutes <= 0) return false
  if (!lastAt) return true
  const slack = Math.min(5, intervalMinutes / 4)
  return now.getTime() - lastAt.getTime() >= (intervalMinutes - slack) * 60_000
}
