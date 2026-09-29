/**
 * The place a project's site stands at — the coordinates the weather warnings
 * and the map go by — when its address is changed in the card's small window.
 *
 * The town picker hands over the place it found (picked from its list, or the
 * one whose name was typed exactly); that place is taken as it is. A town
 * typed without the picker finding it is looked up by name when it is new or
 * had no place yet, as the form's own save would leave it to the weather to
 * do. No town, no place: an emptied town must not leave the old pin behind.
 */

export type SitePlace = { latitude: number; longitude: number }

/** What becomes of the stored place: taken, cleared (null), looked up by the town's name, or kept. */
export type SitePlaceChoice = SitePlace | null | 'lookUp' | 'keep'

const degrees = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : null

/**
 * The coordinates a form sends with its town (the town picker's hidden
 * fields): kept only beside a town, and only where they are a place on earth.
 */
export function formPlace(
  city: string | null,
  latitude: number | null,
  longitude: number | null
): { latitude: number | null; longitude: number | null } {
  const lat = degrees(latitude, 90)
  const lon = degrees(longitude, 180)
  return city && lat != null && lon != null ? { latitude: lat, longitude: lon } : { latitude: null, longitude: null }
}

export function sitePlaceChoice(
  city: string | null,
  sent: { latitude?: unknown; longitude?: unknown },
  before: { city: string | null; latitude: number | null }
): SitePlaceChoice {
  if (!city) return null
  const latitude = degrees(sent.latitude, 90)
  const longitude = degrees(sent.longitude, 180)
  if (latitude != null && longitude != null) return { latitude, longitude }
  return city !== before.city || before.latitude == null ? 'lookUp' : 'keep'
}
