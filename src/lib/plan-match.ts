// Tying a line of the year-planning sheet to the project it became.
//
// The two never spell a site the same way. The sheet says "Musterhof
// Innenausbau", the project is "2026-0042 · Innenausbau" for customer
// "Musterhof". So matching works on words, not on the whole string, and it
// only ever *suggests*: a wrong link is worse than no link, so anything
// unclear is left alone.

/** A line of the sheet, as far as matching cares. */
export type MatchEntry = {
  id: string
  name: string
  /** 1-12, or null for a site parked on the year without a month. */
  month: number | null
}

/** A project, as far as matching cares. */
export type MatchProject = {
  id: string
  number: string
  name: string
  customer: string
  /** 0-11, from the planned start; null when the project has no date yet. */
  month: number | null
}

export type Suggestion = {
  entryId: string
  projectId: string
  /** 0-1; how much of the shorter side the two have in common. */
  score: number
  sameMonth: boolean
}

/** Words that say what kind of work it is — they match everywhere, so they
 *  must never carry a match on their own. */
const TRADE_WORDS = new Set([
  'fassade', 'maler', 'malerarbeiten', 'anstrich', 'innen', 'aussen', 'außen',
  'innenausbau', 'innenputz', 'aussenputz', 'außenputz', 'putz', 'estrich',
  'trockenbau', 'wdvs', 'gerüst', 'geruest', 'dg', 'dd', 'fs', 'tk', 'rest',
  'restarbeiten', 'wasserschaden', 'brandschaden', 'treppenhaus', 'bad', 'flur',
  'küche', 'kueche', 'decke', 'wohnung', 'haus', 'neubau', 'altbau', 'sanierung',
  'und', 'der', 'die', 'das', 'für', 'fuer', 'von', 'am', 'ab', 'im', 'in',
])

/** Lower-case words of 2+ letters, umlauts folded, numbers kept. */
export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
}

/** Tokens that actually identify a site — the trade words dropped. */
function namingTokens(value: string): Set<string> {
  return new Set(tokenize(value).filter((t) => !TRADE_WORDS.has(t)))
}

/**
 * How much two names have in common, 0-1: the share of the *shorter* set of
 * identifying words. "Musterhof" against "Musterhof Innenausbau" is a full 1,
 * because everything the short side says is confirmed by the long one.
 */
export function scoreName(planName: string, projectText: string): number {
  const a = namingTokens(planName)
  const b = namingTokens(projectText)
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  if (shared === 0) return 0
  return shared / Math.min(a.size, b.size)
}

/** Below this a pair is not offered at all. */
export const MIN_SCORE = 0.6
/** The best candidate must beat the runner-up by this much, or it is unclear. */
export const MIN_LEAD = 0.15

/**
 * The one project a line most likely belongs to — or null when nothing is
 * close enough, or when two projects are equally close and a guess would be
 * a coin toss.
 */
export function suggestForEntry(
  entry: MatchEntry,
  projects: MatchProject[]
): Suggestion | null {
  const scored = projects
    .map((project) => {
      const base = scoreName(entry.name, `${project.name} ${project.customer}`)
      const sameMonth =
        entry.month !== null && project.month !== null && project.month + 1 === entry.month
      // The month only breaks a tie; it can never carry a weak name match.
      return { project, base, score: base + (sameMonth ? 0.1 : 0), sameMonth }
    })
    .filter((c) => c.base >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best) return null
  const runnerUp = scored[1]
  if (runnerUp && best.score - runnerUp.score < MIN_LEAD) return null

  return {
    entryId: entry.id,
    projectId: best.project.id,
    score: Math.min(1, best.base),
    sameMonth: best.sameMonth,
  }
}

/**
 * Suggestions for every unlinked line. A project already taken by a stronger
 * line is not offered again, so two sites never point at the same project.
 */
export function suggestMatches(
  entries: MatchEntry[],
  projects: MatchProject[],
  takenProjectIds: Iterable<string> = []
): Suggestion[] {
  const taken = new Set(takenProjectIds)
  const all = entries
    .map((entry) => suggestForEntry(entry, projects))
    .filter((s): s is Suggestion => s !== null)
    .sort((a, b) => b.score - a.score)

  const out: Suggestion[] = []
  for (const suggestion of all) {
    if (taken.has(suggestion.projectId)) continue
    taken.add(suggestion.projectId)
    out.push(suggestion)
  }
  return out
}

/**
 * The key a link survives a re-import under. A year is replaced as a whole, so
 * the new rows have new ids; month plus name is what stays the same.
 */
export function linkKey(month: number | null, name: string): string {
  return `${month ?? 'open'}|${tokenize(name).join(' ')}`
}
