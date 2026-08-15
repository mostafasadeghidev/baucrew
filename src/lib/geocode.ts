import 'server-only'

/**
 * Place search via the free, keyless Open-Meteo geocoding API (Germany first).
 * Used by the city picker (suggestions) and by the weather module (fallback for
 * projects without stored coordinates). Failures degrade to "no results".
 */

export type PlaceSuggestion = {
  name: string
  admin1: string | null // e.g. "Bayern"
  postcode: string | null
  latitude: number
  longitude: number
}

export async function searchPlaces(query: string, count = 6): Promise<PlaceSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=de&countryCode=DE`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      results?: Array<{
        name: string
        admin1?: string
        postcodes?: string[]
        latitude: number
        longitude: number
      }>
    }
    return (data.results ?? []).map((r) => ({
      name: r.name,
      admin1: r.admin1 ?? null,
      postcode: r.postcodes?.[0] ?? null,
      latitude: r.latitude,
      longitude: r.longitude,
    }))
  } catch {
    return []
  }
}

/** First match for a city name, or null when the place cannot be found. */
export async function geocodeCity(city: string): Promise<{ latitude: number; longitude: number } | null> {
  const [hit] = await searchPlaces(city, 1)
  return hit ? { latitude: hit.latitude, longitude: hit.longitude } : null
}
