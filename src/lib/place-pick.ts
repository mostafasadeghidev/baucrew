/**
 * Which of the places a town search found is the town meant: one of that very
 * name — and where several share the name, the one the postal code belongs
 * to — else the first the search offers. Null when it found none.
 */
export type PlaceHit = { name: string; postcodes?: string[]; latitude: number; longitude: number }

export function pickPlace<T extends PlaceHit>(hits: T[], city: string, postalCode?: string | null): T | null {
  const name = city.trim().toLowerCase()
  const same = hits.filter((h) => h.name.trim().toLowerCase() === name)
  const code = postalCode?.trim()
  const byCode = code ? (same.length > 0 ? same : hits).find((h) => h.postcodes?.includes(code)) : undefined
  return byCode ?? same[0] ?? hits[0] ?? null
}
