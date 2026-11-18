// Whether a job is worked outside, so rain matters to it. Pure.
//
// A trade ticked as outdoor in Settings (Gewerke) says so on its own. Plaster
// and paint are done inside and outside alike, and the office books a
// rendered or painted facade as "Putz" or "Malern" as often as "Außenfassade":
// those jobs count when their own words name the outside — the work note, the
// card's "Art der Arbeit" as written, the title they came in with, the
// description ("Außenputz", "AP", "Fassade streichen", "Innen- und Außenputz").

export type OutdoorInput = {
  workCategories: Array<{ workCategory: { outdoor: boolean; nameDe?: string; nameEn?: string } }>
  workNote?: string | null
  workTypeText?: string | null
  sourceTitle?: string | null
  description?: string | null
}

/** The fields read for facade words, in the order they are trusted. */
export const OUTDOOR_TEXT_FIELDS = ['workNote', 'workTypeText', 'sourceTitle', 'description'] as const
export type OutdoorTextField = (typeof OUTDOOR_TEXT_FIELDS)[number]

export type OutdoorBecause = { by: 'trade' } | { by: 'text'; field: OutdoorTextField; word: string }

/**
 * The trades that may be outside or in, by the start of their name, folded:
 * plaster, paint, lacquer. Read off the name because Settings has no tick for
 * "sometimes"; a renamed trade outside these falls back to its outdoor tick.
 */
const EITHER_WAY = ['putz', 'maler', 'anstrich', 'lackier', 'plaster', 'paint', 'lacquer']

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')

/** Whether a trade is one whose work may be on the facade — Putz, Malern, Lackierarbeiten. */
export function mayBeOutside(trade: { nameDe?: string; nameEn?: string }): boolean {
  return [trade.nameDe, trade.nameEn].some((n) => n && EITHER_WAY.some((w) => fold(n).trim().startsWith(w)))
}

const NOT_LETTER = '(?<!\\p{L})'
const AUSSEN = 'au(?:ß|ss)en'
/** What follows "Außen" when the outside of a building is meant, not "nach außen" or an "Außenecke". */
const OUTSIDE_WORK = '(?:putz|anstrich|arbeit|fassad|sockel|streich|farb|maler|beschicht|bereich|fl(?:ä|ae|a)che)'
const JOIN = '\\s*(?:und|sowie|&|/|,)\\s*'

const FACADE_WORDS = [
  // Fassade, Fassadenputz, Westfassade, Gesamtfassadenfläche
  new RegExp(`\\p{L}*fassad\\p{L}*`, 'iu'),
  // Außenputz, Aussenanstrich, Außenputzarbeiten, Außenbereich
  new RegExp(`${NOT_LETTER}${AUSSEN}${OUTSIDE_WORK}\\p{L}*`, 'iu'),
  // Außen- und Innenputz
  new RegExp(`${NOT_LETTER}${AUSSEN}-${JOIN}\\p{L}*${OUTSIDE_WORK}\\p{L}*`, 'iu'),
  // innen und außen, außen und innen
  new RegExp(`${NOT_LETTER}(?:innen${JOIN}${AUSSEN}|${AUSSEN}${JOIN}innen)(?!\\p{L})`, 'iu'),
]

/** The first word in a text that puts the work on the outside of a building, as written; null when none does. */
export function facadeWord(text: string | null | undefined): string | null {
  if (!text) return null
  let first: { at: number; word: string } | null = null
  for (const re of FACADE_WORDS) {
    const m = re.exec(text)
    if (m && (!first || m.index < first.at)) first = { at: m.index, word: m[0] }
  }
  return first ? first.word.replace(/\s+/g, ' ').trim() : null
}

/**
 * "AP", the office's short form of Außenputz, standing as an entry of its own
 * in "Art der Arbeit" ("IP, AP"). Read only there: elsewhere two letters say
 * too little.
 */
const AP_ENTRY = /(?:^|,)\s*(AP)\s*(?=,|$)/i

/**
 * Why a job counts as outdoor work, or null when it does not: an outdoor
 * trade, or a plaster or paint trade whose own words name the facade.
 */
export function outdoorWork(project: OutdoorInput): OutdoorBecause | null {
  const trades = project.workCategories.map((wc) => wc.workCategory)
  if (trades.some((t) => t.outdoor)) return { by: 'trade' }
  if (!trades.some(mayBeOutside)) return null
  for (const field of OUTDOOR_TEXT_FIELDS) {
    const word = facadeWord(project[field]) ?? (field === 'workTypeText' ? (AP_ENTRY.exec(project[field] ?? '')?.[1] ?? null) : null)
    if (word) return { by: 'text', field, word }
  }
  return null
}
