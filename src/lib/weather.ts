import 'server-only'
import { geocodeCity } from './geocode'
import { db } from './db'
import { addDays, iso, todayUtc, utcDate } from './dates'
import { outdoorWork, type OutdoorBecause, type OutdoorInput } from './outdoor-work'
import {
  RAIN_HORIZON_DAYS,
  rainConfidence,
  rainDays,
  rainPlan,
  type DayForecast,
  type RainConfidence,
  type RainDay,
  type RainProject,
  type RainSkip,
} from './rain-days'

// Rain lookups via the Open-Meteo API (DWD ICON models for Germany).
// Failures (offline, timeout, unknown city) must never break a page — this
// module degrades to "no warnings".

const DEFAULT_RAIN_THRESHOLD = 60 // %

/** Rain-probability threshold (%) from Settings, default 60. */
export async function getRainThreshold(): Promise<number> {
  try {
    const row = await db.appSetting.findUnique({ where: { key: 'rainThreshold' } })
    const n = row ? Number(row.value) : NaN
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_RAIN_THRESHOLD
  } catch {
    return DEFAULT_RAIN_THRESHOLD
  }
}

type Coords = { latitude: number; longitude: number }

/**
 * A place's next two weeks, one call for all of them. The address is the
 * same for every page and every day asked about — the place rounded to about
 * a kilometre, the whole window — so the overview, the schedule, the map and
 * every card share one cached answer per place per hour. The free API is for
 * non-commercial use; with OPEN_METEO_API_KEY set the paid one is asked.
 * Null when the service does not answer.
 */
async function dailyForecast(coords: Coords): Promise<Map<string, DayForecast> | null> {
  if (process.env.WEATHER_STUB === '1' && process.env.NODE_ENV !== 'production') return stubForecast(coords)
  const key = process.env.OPEN_METEO_API_KEY
  const host = key ? 'https://customer-api.open-meteo.com' : 'https://api.open-meteo.com'
  try {
    const res = await fetch(
      `${host}/v1/forecast?latitude=${coords.latitude.toFixed(2)}&longitude=${coords.longitude.toFixed(2)}` +
        `&daily=precipitation_probability_max,precipitation_sum&timezone=Europe%2FBerlin&forecast_days=${RAIN_HORIZON_DAYS}` +
        (key ? `&apikey=${encodeURIComponent(key)}` : ''),
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      daily?: { time?: string[]; precipitation_probability_max?: Array<number | null>; precipitation_sum?: Array<number | null> }
    }
    const out = new Map<string, DayForecast>()
    const probs = data.daily?.precipitation_probability_max ?? []
    const sums = data.daily?.precipitation_sum ?? []
    ;(data.daily?.time ?? []).forEach((time, i) => {
      const p = probs[i]
      if (p != null) out.set(time, { probability: p, amount: sums[i] ?? null })
    })
    return out
  } catch {
    return null
  }
}

/**
 * Invented weather for screenshots and trying things out with invented data
 * (WEATHER_STUB=1, never in production): the same place gets the same days.
 */
function stubForecast(coords: Coords): Map<string, DayForecast> {
  const seed = Math.round(Math.abs(coords.latitude * 1000 + coords.longitude * 100))
  const out = new Map<string, DayForecast>()
  const today = todayUtc()
  for (let i = 0; i < RAIN_HORIZON_DAYS; i++) {
    const date = iso(addDays(today, i))
    const probability = (seed * 7 + utcDate(date).getUTCDate() * 37) % 100
    out.set(date, { probability, amount: probability >= 50 ? Math.round(probability / 8) / 2 : 0 })
  }
  return out
}

/**
 * Where a site's weather is looked up, and so the name its warnings carry:
 * the stored coordinates when there are some, else the town's name. Matching
 * a warning back by this rather than by the town's name keeps two towns of
 * one name apart, and one town written two ways together.
 */
export function weatherPlace(p: { city?: string | null; latitude?: number | null; longitude?: number | null }): string {
  return p.latitude != null && p.longitude != null ? `${p.latitude},${p.longitude}` : `name:${(p.city ?? '').trim().toLowerCase()}`
}

type Site = { city?: string | null; latitude?: number | null; longitude?: number | null }

/**
 * Each place's forecast, looked up once however many jobs and days stand
 * there: `null` where the town is not found, `undefined` where the service
 * gave no answer. Places with stored coordinates skip the town search.
 */
async function forecastsByPlace(sites: Site[]): Promise<Map<string, { city: string; forecast: Map<string, DayForecast> | null | undefined }>> {
  const groups = new Map<string, Site>()
  for (const s of sites) {
    const key = weatherPlace(s)
    if (key !== 'name:' && !groups.has(key)) groups.set(key, s)
  }
  const out = new Map<string, { city: string; forecast: Map<string, DayForecast> | null | undefined }>()
  await Promise.all(
    [...groups.entries()].map(async ([key, s]) => {
      const coords =
        s.latitude != null && s.longitude != null
          ? { latitude: s.latitude, longitude: s.longitude }
          : await geocodeCity(s.city ?? '')
      const forecast = coords ? ((await dailyForecast(coords)) ?? undefined) : null
      out.set(key, { city: s.city ?? '', forecast })
    })
  )
  return out
}

export type RainWarning = {
  city: string
  date: string
  probability: number
  /** Rain the day brings, in mm; null when the source gives none. */
  amount: number | null
  confidence: RainConfidence
  place: string
}

export type WeatherPair = { city: string; date: string; latitude?: number | null; longitude?: number | null }

/**
 * Rain warnings (probability >= the threshold from Settings) for the given
 * town/date pairs. Dates outside the two-week window are skipped.
 */
export async function getRainWarnings(pairs: WeatherPair[]): Promise<RainWarning[]> {
  const today = todayUtc()
  const inRange = pairs.filter((p) => rainConfidence(p.date, today) && p.city.trim())
  if (inRange.length === 0) return []
  const [threshold, places] = await Promise.all([getRainThreshold(), forecastsByPlace(inRange)])

  const warnings: RainWarning[] = []
  const seen = new Set<string>()
  for (const p of inRange) {
    const place = weatherPlace(p)
    if (seen.has(`${place}|${p.date}`)) continue
    seen.add(`${place}|${p.date}`)
    const at = places.get(place)
    if (!at?.forecast) continue
    for (const d of rainDays([p.date], at.forecast, threshold, today)) {
      warnings.push({ city: at.city, date: d.date, probability: d.probability, amount: d.amount, confidence: d.confidence, place })
    }
  }
  return warnings.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * A job's rain over the next two weeks: the rainy days among those it is
 * planned on, or why nothing could be said — the plan's reason, a town the
 * search does not know (`placeUnknown`), or a service that did not answer
 * (`unavailable`).
 */
export type ProjectRain =
  | { ok: true; days: RainDay[]; checked: number; source: 'schedule' | 'planned'; outdoor: OutdoorBecause }
  | { ok: false; reason: RainSkip | 'placeUnknown' | 'unavailable' }

/** The rain of many jobs at once, one lookup per place; keyed by project id. */
export async function getProjectsRain<P extends RainProject & { id: string }>(projects: P[]): Promise<Map<string, ProjectRain>> {
  const today = todayUtc()
  const plans = projects.map((p) => ({ project: p, plan: rainPlan(p, today) }))
  const wanted = plans.filter((x) => x.plan.ok).map((x) => x.project)
  const [threshold, places] = await Promise.all([
    getRainThreshold(),
    wanted.length > 0 ? forecastsByPlace(wanted) : Promise.resolve(new Map()),
  ])
  const out = new Map<string, ProjectRain>()
  for (const { project, plan } of plans) {
    if (!plan.ok) {
      out.set(project.id, { ok: false, reason: plan.reason })
      continue
    }
    const at = places.get(weatherPlace(project))
    if (!at || at.forecast === null) out.set(project.id, { ok: false, reason: 'placeUnknown' })
    else if (at.forecast === undefined) out.set(project.id, { ok: false, reason: 'unavailable' })
    else
      out.set(project.id, {
        ok: true,
        days: rainDays(plan.days, at.forecast, threshold, today),
        checked: plan.days.length,
        source: plan.source,
        outdoor: plan.outdoor,
      })
  }
  return out
}

/**
 * Whether a job is weather-sensitive: one of its trades is ticked as outdoor
 * work in Settings (Gewerke) — the tick, not the trade's name, so a renamed
 * trade keeps its warnings — or its plaster or paint work is on the facade
 * by its own words (src/lib/outdoor-work.ts).
 */
export function isOutdoorJob(project: OutdoorInput): boolean {
  return outdoorWork(project) !== null
}
