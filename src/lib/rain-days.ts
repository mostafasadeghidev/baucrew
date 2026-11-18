// Which days of a job are looked up for rain, and how far a forecast for them
// can be trusted. Pure: the forecast itself is fetched in src/lib/weather.ts.

import { addDays, iso, utcDate } from './dates'
import { outdoorWork, type OutdoorBecause, type OutdoorInput } from './outdoor-work'

/**
 * How far ahead the warnings look: two weeks, today included. Open-Meteo
 * gives 16 days, but its last days come from coarse global models alone and
 * say little more than the season does.
 */
export const RAIN_HORIZON_DAYS = 14

/**
 * The days a warning is firm: today and the six after it. For Germany
 * Open-Meteo's forecast is built on the DWD's ICON models — ICON-D2 (2 km)
 * for two days, ICON-EU (7 km) for five, the global ICON and its ensemble
 * for 7.5. After that only the global GFS and ECMWF models (~25 km) are left,
 * and a day's rain there is a tendency, not a forecast of the day.
 */
export const RAIN_FIRM_DAYS = 7

export type RainConfidence = 'firm' | 'trend'

/** The days the warnings cover, both ends included, as ISO dates. */
export function rainWindow(today: Date): { from: string; to: string } {
  return { from: iso(today), to: iso(addDays(today, RAIN_HORIZON_DAYS - 1)) }
}

/** How sure a forecast for this day is, seen from today; null outside the window. */
export function rainConfidence(date: string, today: Date): RainConfidence | null {
  const offset = Math.round((utcDate(date).getTime() - utcDate(iso(today)).getTime()) / 86_400_000)
  if (offset < 0 || offset >= RAIN_HORIZON_DAYS) return null
  return offset < RAIN_FIRM_DAYS ? 'firm' : 'trend'
}

/** Statuses whose work is over: they are warned of nothing. */
export const RAIN_CLOSED_STATUSES = ['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'] as const

export type RainProject = OutdoorInput & {
  status: string
  doneAt?: Date | null
  pausedAt?: Date | null
  archivedAt?: Date | null
  city: string | null
  latitude?: number | null
  longitude?: number | null
  plannedStart: Date | null
  plannedEnd: Date | null
  /** The days it is planned on — cancelled ones left out by the caller. */
  scheduleEntries: Array<{ date: Date }>
}

/**
 * Why a project gets no rain warning at all. `closed`, `paused` and
 * `archived` are said nowhere — nobody expects weather for them; the others
 * tell the office what to fill in.
 */
export type RainSkip = 'closed' | 'paused' | 'archived' | 'notOutdoor' | 'noPlace' | 'noDates' | 'outsideWindow'

export type RainPlan =
  | { ok: true; days: string[]; source: 'schedule' | 'planned'; outdoor: OutdoorBecause }
  | { ok: false; reason: RainSkip }

/**
 * The days of a job that rain matters on, within the window. The schedule's
 * days come first: once a job has a day planned from today on, those days and
 * no others count. Without one the planned start–end range stands in, Monday
 * to Friday — a start alone is one day.
 */
export function rainPlan(project: RainProject, today: Date): RainPlan {
  if ((RAIN_CLOSED_STATUSES as readonly string[]).includes(project.status) || project.doneAt) return { ok: false, reason: 'closed' }
  if (project.archivedAt) return { ok: false, reason: 'archived' }
  if (project.pausedAt) return { ok: false, reason: 'paused' }
  const outdoor = outdoorWork(project)
  if (!outdoor) return { ok: false, reason: 'notOutdoor' }
  if (!project.city?.trim() && (project.latitude == null || project.longitude == null)) return { ok: false, reason: 'noPlace' }

  const { from, to } = rainWindow(today)
  const ahead = project.scheduleEntries.map((e) => iso(e.date)).filter((d) => d >= from)
  if (ahead.length > 0) {
    const days = [...new Set(ahead)].filter((d) => d <= to).sort()
    return days.length > 0 ? { ok: true, days, source: 'schedule', outdoor } : { ok: false, reason: 'outsideWindow' }
  }

  if (!project.plannedStart) return { ok: false, reason: 'noDates' }
  const start = iso(project.plannedStart)
  const end = project.plannedEnd ? iso(project.plannedEnd) : start
  const days: string[] = []
  for (let d = start < from ? from : start; d <= end && d <= to; d = iso(addDays(utcDate(d), 1))) {
    const weekday = utcDate(d).getUTCDay()
    if (weekday !== 0 && weekday !== 6) days.push(d)
  }
  return days.length > 0 ? { ok: true, days, source: 'planned', outdoor } : { ok: false, reason: 'outsideWindow' }
}

export type DayForecast = { probability: number; amount: number | null }

export type RainDay = { date: string; probability: number; amount: number | null; confidence: RainConfidence }

/** The planned days whose rain probability reaches the threshold, soonest first. */
export function rainDays(
  days: string[],
  forecast: Map<string, DayForecast>,
  threshold: number,
  today: Date
): RainDay[] {
  const out: RainDay[] = []
  for (const date of [...new Set(days)].sort()) {
    const f = forecast.get(date)
    const confidence = rainConfidence(date, today)
    if (!f || !confidence || f.probability < threshold) continue
    out.push({ date, probability: f.probability, amount: f.amount, confidence })
  }
  return out
}
