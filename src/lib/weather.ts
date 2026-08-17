import 'server-only'
import { geocodeCity } from './geocode'
import { db } from './db'

// Rain-probability lookups via the free, keyless Open-Meteo API.
// Failures (offline, timeout, unknown city) must never break the schedule
// board — this module degrades to "no warnings".

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
const FORECAST_DAYS = 16 // Open-Meteo daily forecast horizon

type Coords = { latitude: number; longitude: number }

async function rainProbabilities(
  coords: Coords,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}` +
        `&daily=precipitation_probability_max&timezone=UTC&start_date=${startDate}&end_date=${endDate}`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) return out
    const data = (await res.json()) as {
      daily?: { time?: string[]; precipitation_probability_max?: Array<number | null> }
    }
    const times = data.daily?.time ?? []
    const probs = data.daily?.precipitation_probability_max ?? []
    times.forEach((time, i) => {
      const p = probs[i]
      if (p != null) out.set(time, p)
    })
  } catch {
    // degrade silently
  }
  return out
}

export type RainWarning = { city: string; date: string; probability: number }

export type WeatherPair = { city: string; date: string; latitude?: number | null; longitude?: number | null }

/**
 * Returns rain warnings (probability >= configured threshold, default 60 %) for the given city/date pairs.
 * Pairs with stored coordinates skip geocoding (exact + faster); others are
 * geocoded by name. Dates outside the forecast horizon are skipped.
 */
export async function getRainWarnings(pairs: WeatherPair[]): Promise<RainWarning[]> {
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const horizon = new Date(today)
  horizon.setUTCDate(horizon.getUTCDate() + FORECAST_DAYS - 1)
  const horizonIso = horizon.toISOString().slice(0, 10)

  const inRange = pairs.filter((p) => p.date >= todayIso && p.date <= horizonIso && p.city.trim())
  if (inRange.length === 0) return []
  const threshold = await getRainThreshold()

  // Group by location key: coordinates when known, otherwise the city name.
  const groups = new Map<string, { city: string; coords: Coords | null; dates: string[] }>()
  for (const p of inRange) {
    const hasCoords = p.latitude != null && p.longitude != null
    const key = hasCoords ? `${p.latitude},${p.longitude}` : `name:${p.city}`
    const g = groups.get(key) ?? {
      city: p.city,
      coords: hasCoords ? { latitude: p.latitude!, longitude: p.longitude! } : null,
      dates: [],
    }
    g.dates.push(p.date)
    groups.set(key, g)
  }

  const warnings: RainWarning[] = []
  await Promise.all(
    [...groups.values()].map(async (g) => {
      const coords = g.coords ?? (await geocodeCity(g.city))
      if (!coords) return
      const sorted = [...g.dates].sort()
      const probs = await rainProbabilities(coords, sorted[0], sorted[sorted.length - 1])
      for (const date of new Set(g.dates)) {
        const p = probs.get(date)
        if (p != null && p >= threshold) {
          warnings.push({ city: g.city, date, probability: p })
        }
      }
    })
  )
  return warnings.sort((a, b) => a.date.localeCompare(b.date))
}

/** Work categories whose jobs are weather-sensitive (outdoor work). */
export const OUTDOOR_CATEGORIES = ['Außenfassade', 'WDVS', 'Gerüstbau']
