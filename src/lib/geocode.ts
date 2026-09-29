import 'server-only'
import { pickPlace } from './place-pick'

/**
 * Place search via the free, keyless Open-Meteo geocoding API (Germany first).
 * Used by the city picker (suggestions) and by the weather module (fallback for
 * projects without stored coordinates). Failures degrade to "no results".
 */

export type PlaceSuggestion = {
  name: string
  admin1: string | null // e.g. "Bayern"
  postcode: string | null
  /** Every postal code of the place — a town of one name is told from another by them. */
  postcodes: string[]
  latitude: number
  longitude: number
}

export async function searchPlaces(query: string, count = 6): Promise<PlaceSuggestion[]> {
  return (await lookupPlaces(query, count)).results
}

/**
 * The same search, saying whether the service answered at all — the town
 * picker tells "not found" apart from "cannot look it up right now".
 */
export async function lookupPlaces(query: string, count = 6): Promise<{ results: PlaceSuggestion[]; answered: boolean }> {
  const q = query.trim()
  if (q.length < 2) return { results: [], answered: true }
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=de&countryCode=DE`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) return { results: [], answered: false }
    const data = (await res.json()) as {
      results?: Array<{
        name: string
        admin1?: string
        postcodes?: string[]
        latitude: number
        longitude: number
      }>
    }
    const results = (data.results ?? []).map((r) => ({
      name: r.name,
      admin1: r.admin1 ?? null,
      postcode: r.postcodes?.[0] ?? null,
      postcodes: r.postcodes ?? [],
      latitude: r.latitude,
      longitude: r.longitude,
    }))
    return { results, answered: true }
  } catch {
    return { results: [], answered: false }
  }
}

/**
 * The place of a town typed without picking one: of the places the search
 * finds, the one of that very name — where several share it, the one the
 * postal code belongs to — else the first. Null when nothing is found.
 */
export async function geocodeCity(city: string, postalCode?: string | null): Promise<{ latitude: number; longitude: number } | null> {
  const hit = pickPlace(await searchPlaces(city, 6), city, postalCode)
  return hit ? { latitude: hit.latitude, longitude: hit.longitude } : null
}
