/**
 * The search window's rules (⌘K, the magnifier in the shell's head): how a
 * query is cut into words, which spellings of a word the database is asked
 * for, and how the rows that come back are put in order.
 *
 * The database finds candidates with `ILIKE` — every word of the query in
 * some field of the row — and this file ranks them: a project whose number
 * is exactly what was typed above one whose name merely contains it, a name
 * that starts with the word above one that has it in the middle.
 *
 * German spelling is folded on both sides: "Müller", "Mueller" and "MÜLLER"
 * are the same word, and so are "Straße" and "Strasse". The database cannot
 * fold without an extension, so it is asked for each spelling a word may
 * have (`wordVariants`) and the ranking here folds properly.
 *
 * Pure: nothing here touches the database.
 */

/** At most this many words of a query count; the rest is noise. */
export const MAX_WORDS = 6
/** A query longer than this is cut. */
export const MAX_QUERY = 100

/**
 * One spelling for comparing: lower case, umlauts and ß written out the way
 * a German keyboard without them writes them, other accents dropped.
 */
export function foldText(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The words of a query, as typed (trimmed, lower case, no repeats). */
export function queryWords(q: string): string[] {
  const words = q.normalize('NFC').slice(0, MAX_QUERY).toLowerCase().split(/\s+/).filter(Boolean)
  return [...new Set(words)].slice(0, MAX_WORDS)
}

/**
 * The spellings of one word the database is asked for: as typed, written
 * out ("müller" → "mueller", "straße" → "strasse") and with the umlauts put
 * back ("mueller" → "müller", "strasse" → "straße"). `ILIKE` is blind to
 * case, so "Muster" and "muster" need no variant of their own.
 */
export function wordVariants(word: string): string[] {
  const typed = word.normalize('NFC').toLowerCase()
  const folded = foldText(typed)
  const umlauts = folded.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü').replace(/ss/g, 'ß')
  return [...new Set([typed, folded, umlauts])]
}

/** Digits only: "2026-0048" → "20260048". */
function digits(s: string): string {
  return s.replace(/\D/g, '')
}

/**
 * A field of a row the query is compared with. `code` is a number of some
 * kind (project number, Projektnummer, inventory number): its digits count on
 * their own too, so "48" finds "2026-0048" and "20260048" finds it as well.
 */
export type SearchField = { text: string | null | undefined; weight: number; code?: boolean }

/** How well one (folded) word sits in one field: 0 not at all, 4 the whole field. */
function wordFit(word: string, field: string, code: boolean): number {
  const text = foldText(field)
  if (!text) return 0
  if (text === word) return 4
  if (code) {
    const d = digits(word)
    const fieldDigits = digits(field)
    // A number written with its dash or without one: only digits typed count here.
    if (d && d.length === word.replace(/[\s/-]/g, '').length && fieldDigits) {
      if (fieldDigits === d) return 4
      // Numbers are read from the end: "48" and "0048" are the 48th of a year.
      if (fieldDigits.endsWith(d)) return 3
      if (fieldDigits.includes(d)) return 1
    }
  }
  if (text.startsWith(word)) return 3
  if (new RegExp(`[\\s·,./()-]${escapeRegExp(word)}`).test(text)) return 2
  return text.includes(word) ? 1 : 0
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A row's score for a query: the best fit of every word, weighed by the
 * field it fits. Null when a word fits nowhere — every word must be found,
 * the way the database was asked for it.
 */
export function scoreRow(words: string[], fields: SearchField[]): number | null {
  if (words.length === 0) return 0
  let score = 0
  for (const raw of words) {
    const word = foldText(raw)
    let best = 0
    for (const f of fields) {
      if (!f.text) continue
      best = Math.max(best, wordFit(word, f.text, f.code ?? false) * f.weight)
    }
    if (best === 0) return null
    score += best
  }
  // The whole query standing in one field as typed beats its words scattered.
  const phrase = foldText(words.join(' '))
  if (words.length > 1 && fields.some((f) => f.text && foldText(f.text).includes(phrase))) score += 5
  return score
}

/**
 * Rows in order of their score, best first; equal scores keep the order the
 * database gave them (the newest first). Rows a word does not fit are
 * dropped, and only `limit` are kept.
 */
export function rankRows<T>(rows: T[], words: string[], fieldsOf: (row: T) => SearchField[], limit: number): T[] {
  return rows
    .map((row, i) => ({ row, i, score: scoreRow(words, fieldsOf(row)) }))
    .filter((x): x is { row: T; i: number; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.row)
}

/** The line under a result: its parts joined, the empty ones left out. */
export function metaLine(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' · ')
}

// ── Recently opened ──────────────────────────────────────────────────

/** A project opened from the window, kept in the browser for the empty query. */
export type RecentProject = { id: string; title: string; meta: string }

export const RECENT_MAX = 6

/** The list with this project in front, an older copy of it taken out. */
export function pushRecent(list: RecentProject[], entry: RecentProject, max = RECENT_MAX): RecentProject[] {
  return [entry, ...list.filter((r) => r.id !== entry.id)].slice(0, max)
}

/** What the browser has stored, read defensively: anything malformed is dropped. */
export function parseRecent(raw: string | null): RecentProject[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value
      .filter(
        (r): r is RecentProject =>
          !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.title === 'string' && typeof r.meta === 'string'
      )
      .slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

// ── Keys ─────────────────────────────────────────────────────────────

/**
 * Whether a key press opens the window: ⌘K on a Mac, Ctrl+K elsewhere —
 * also while something is being typed, the way every app with one does it.
 * Not "/": on the projects board that key is the board's own search
 * (board-keys.tsx), and two meanings for one key is one too many.
 */
export function opensSearch(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): boolean {
  return e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
}

/** The window's place for one result, moved by the arrow keys: round the end and back. */
export function moveActive(active: number, count: number, step: 1 | -1): number {
  if (count === 0) return 0
  return (active + step + count) % count
}
