/**
 * The month of Trello's dates window: six weeks of days, Monday first, with
 * the days of the months either side filling the first and last week. Days
 * are "YYYY-MM-DD" strings in UTC — the same shape the date fields and the
 * database's day columns use — so nothing shifts with the time zone.
 *
 * Pure, so the grid is tested without a browser.
 */

export type GridDay = { day: string; inMonth: boolean }

const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DD" of a UTC date. */
export function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** The first of the month a "YYYY-MM-DD" day falls in, as { year, month } with month 0–11. */
export function monthOf(day: string): { year: number; month: number } {
  const [y, m] = day.split('-').map(Number)
  return { year: y, month: m - 1 }
}

/** The month before or after, across the turn of the year. */
export function addMonths(at: { year: number; month: number }, delta: number): { year: number; month: number } {
  const index = at.year * 12 + at.month + delta
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 }
}

/** Six weeks of days around a month, each week starting on Monday. */
export function monthGrid(year: number, month: number): GridDay[] {
  const first = new Date(Date.UTC(year, month, 1))
  // getUTCDay: Sunday 0 … Saturday 6; Monday first means Sunday counts 6.
  const lead = (first.getUTCDay() + 6) % 7
  const start = Date.UTC(year, month, 1 - lead)
  const days: GridDay[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start + i * 86_400_000)
    days.push({ day: dayKey(d), inMonth: d.getUTCMonth() === month })
  }
  return days
}

/** Whether a day lies between two others, both included; false when either end is missing. */
export function inRange(day: string, from: string | null, to: string | null): boolean {
  return from !== null && to !== null && day >= from && day <= to
}
