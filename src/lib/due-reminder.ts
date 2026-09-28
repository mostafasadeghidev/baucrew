/**
 * A card's due moment and its reminder, the way Trello sets them in the dates
 * window: a day, a time on it if one is given (in the office's time, Berlin),
 * and when to be reminded — not at all, at the moment, minutes, hours or a
 * day or two before. Without a time the day begins at midnight, so "a day
 * before" is the morning of the day before, as the bell always told it.
 *
 * Pure: time zones and summer time are tested without a clock.
 */

/** Minutes before the due moment; -1 is no reminder. */
export const REMINDERS = [-1, 0, 5, 10, 15, 60, 120, 1440, 2880] as const
export type Reminder = (typeof REMINDERS)[number]

/** What a card without its own choice is reminded of: a day before. */
export const DEFAULT_REMINDER = 1440

export const OFFICE_TIME_ZONE = 'Europe/Berlin'

export function reminderKey(raw: unknown): Reminder | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  return (REMINDERS as readonly number[]).includes(n) ? (n as Reminder) : null
}

/** "9:5" or "09:05" → "09:05"; anything that is not a time of day → null. */
export function parseDueTime(raw: string | null | undefined): string | null {
  const m = /^\s*(\d{1,2}):(\d{1,2})\s*$/.exec(raw ?? '')
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** How far a time zone is ahead of UTC at a moment, in minutes (+120 in a Berlin summer). */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - at.getTime()) / 60_000)
}

/** The due day (a UTC-midnight date) at its time in the office's zone, as a moment. */
export function dueMoment(dueDate: Date, dueTime: string | null, timeZone: string = OFFICE_TIME_ZONE): Date {
  const [h, m] = (parseDueTime(dueTime) ?? '00:00').split(':').map(Number)
  const guess = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate(), h, m)
  const first = guess - tzOffsetMinutes(timeZone, new Date(guess)) * 60_000
  // Once more with the offset of the moment found, which may lie across a summer-time change.
  return new Date(guess - tzOffsetMinutes(timeZone, new Date(first)) * 60_000)
}

/** When the reminder is due, or null when the card asked for none. */
export function reminderAt(dueDate: Date, dueTime: string | null, reminder: number | null, timeZone: string = OFFICE_TIME_ZONE): Date | null {
  const minutes = reminder ?? DEFAULT_REMINDER
  if (minutes < 0) return null
  return new Date(dueMoment(dueDate, dueTime, timeZone).getTime() - minutes * 60_000)
}
