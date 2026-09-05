// Parser for Trello's standard board export ("Menu → Print, export and share →
// Export as JSON"). Only the fields we import are read; everything else in the
// (large) file is ignored.

export type TrelloList = { id: string; name: string; closed: boolean }
export type TrelloAttachment = { name: string; url: string }
export type TrelloCard = {
  id: string
  name: string
  desc: string
  idList: string
  closed: boolean
  due: string | null
  labels: string[]
  /** Permalink of the card, kept as the project's source link. */
  shortUrl: string
  attachments: TrelloAttachment[]
}
export type TrelloBoard = {
  name: string
  lists: TrelloList[]
  cards: TrelloCard[]
}

export function parseTrelloExport(json: unknown): TrelloBoard | null {
  if (typeof json !== 'object' || json === null) return null
  const raw = json as Record<string, unknown>
  if (!Array.isArray(raw.lists) || !Array.isArray(raw.cards)) return null

  const lists: TrelloList[] = raw.lists
    .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
    .map((l) => ({
      id: String(l.id ?? ''),
      name: String(l.name ?? '').trim(),
      closed: Boolean(l.closed),
    }))
    .filter((l) => l.id && l.name)

  const cards: TrelloCard[] = raw.cards
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      id: String(c.id ?? ''),
      name: String(c.name ?? '').trim(),
      desc: String(c.desc ?? '').trim(),
      idList: String(c.idList ?? ''),
      closed: Boolean(c.closed),
      due: typeof c.due === 'string' ? c.due : null,
      shortUrl: typeof c.shortUrl === 'string' ? c.shortUrl : '',
      labels: Array.isArray(c.labels)
        ? c.labels
            .map((lb) =>
              typeof lb === 'object' && lb !== null ? String((lb as { name?: unknown }).name ?? '') : ''
            )
            .filter(Boolean)
        : [],
      attachments: Array.isArray(c.attachments)
        ? c.attachments
            .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
            .map((a) => ({ name: String(a.name ?? '').trim(), url: String(a.url ?? '').trim() }))
            .filter((a) => a.url)
        : [],
    }))
    .filter((c) => c.id && c.name)

  return { name: String(raw.name ?? 'Trello').trim(), lists, cards }
}

/**
 * The job number the office keeps in brackets at the end of a card title
 * ("Musterhof Innenausbau (4100001)"). It is the number their other systems
 * use, so it is what makes a second import update a project instead of
 * doubling it. A bracket holding several numbers or a note is taken as the
 * first number in it; brackets without a number are left alone.
 */
export function extractJobNumber(title: string): { number: string | null; title: string } {
  const match = title.match(/\(([^)]*?)\)\s*$/)
  if (!match) return { number: null, title: title.trim() }
  const first = match[1].match(/\d{5,9}/)
  if (!first) return { number: null, title: title.trim() }
  return { number: first[0], title: title.slice(0, match.index).trim() }
}

/** Words that describe the building, never the customer. */
const OBJECT_WORDS = new Set([
  'kläranlage', 'klaeranlage', 'mensa', 'musikheim', 'feuerwehr', 'schule',
  'kindergarten', 'kiga', 'sportzentrum', 'autohaus', 'rathaus', 'turnhalle',
  'kirche', 'friedhof', 'bauhof', 'kita',
])

/** Qualifiers: the customer is the word that follows them. */
const QUALIFIERS = new Set([
  'bv', 'hv', 'weg', 'objekt', 'baustelle', 'bauvorhaben', 'hausverwaltung',
])

/** Institutions: they and the word after them together name the customer. */
const INSTITUTIONS = new Set(['gemeinde', 'markt', 'stadt', 'bauamt', 'landkreis', 'kreis'])

const clean = (s: string) => s.replace(/^[\s,;:./-]+|[\s,;:./-]+$/g, '').trim()

export type CardTitle = {
  /** Customer to file the project under. */
  customer: string
  /** Project name: the whole title, minus the job number. */
  project: string
  /** The job number, when the title carried one. */
  number: string | null
  /**
   * False when the title gives no dependable customer, so the office should
   * look at it. The import still runs; it just flags these.
   */
  confident: boolean
}

/**
 * Reads a card title the way the office writes them.
 *
 * The common shape is "Nachname Vorname Ort (Nummer)", so the first word is
 * the customer. Three shapes break that rule and are handled on their own:
 * a qualifier like "HV Musterhof" (the customer follows it), an institution
 * like "Gemeinde Hbach" (both words together are the customer), and a
 * building like "Kläranlage Musterdorf" (there is no customer in the title,
 * so the whole title is used and the card is flagged instead of filing
 * unrelated jobs under one invented customer).
 */
export function splitCardTitle(title: string): CardTitle {
  const { number, title: bare } = extractJobNumber(title)
  const project = clean(bare) || clean(title) || title.trim()

  // An explicit separator usually puts the customer on the left. When the left
  // side is nothing but a qualifier ("BV: Musterhof …"), the name is on the
  // right, so read the whole title instead.
  const sep = project.match(/\s[-–]\s|:\s|\s\/\s/)
  let head = sep && sep.index !== undefined ? project.slice(0, sep.index) : project
  const headWords = clean(head).split(/\s+/).filter(Boolean)
  if (headWords.length <= 1 && QUALIFIERS.has(clean(headWords[0] ?? '').toLowerCase())) {
    head = project.replace(/\s[-–]\s|:\s|\s\/\s/, ' ')
  }
  const words = clean(head).split(/\s+/).filter(Boolean)
  if (words.length === 0) return { customer: project, project, number, confident: false }

  const first = clean(words[0]).toLowerCase()

  if (OBJECT_WORDS.has(first)) {
    // No person or company in the title — keep it whole rather than merging
    // every "Kläranlage" job under one customer that does not exist.
    return { customer: project, project, number, confident: false }
  }

  if (INSTITUTIONS.has(first)) {
    const customer = clean(words.slice(0, 2).join(' ')) || project
    return { customer, project, number, confident: words.length >= 2 }
  }

  if (QUALIFIERS.has(first)) {
    const next = clean(words[1] ?? '')
    if (!next) return { customer: project, project, number, confident: false }
    // "BV Gemeinde Hbach" — the qualifier hides an institution.
    if (INSTITUTIONS.has(next.toLowerCase())) {
      return { customer: clean(words.slice(1, 3).join(' ')), project, number, confident: true }
    }
    return { customer: next, project, number, confident: true }
  }

  return { customer: clean(words[0]), project, number, confident: true }
}

/** Heuristic default status per Trello list name (German column names). */
export function suggestStatus(listName: string): string {
  const n = listName.toLowerCase()
  if (/(storn|abgesagt|cancel|verloren)/.test(n)) return 'CANCELLED'
  if (/(bezahlt|paid)/.test(n)) return 'PAID'
  if (/(rechnung|abgerechnet|invoic)/.test(n)) return 'INVOICED'
  if (/(erledigt|fertigstellung|fertig|abgeschlossen|done|complete)/.test(n)) return 'COMPLETED'
  // "Baustellenbeginn" is a start date, not work in progress — check it first.
  if (/(beginn|geplant|termin|planned|planung|vorbereit)/.test(n)) return 'PLANNED'
  if (/(läuft|laufend|in arbeit|progress|aktiv|unterbrech|pause|baustelle)/.test(n)) return 'IN_PROGRESS'
  if (/(angebot|quote|kalkul)/.test(n)) return 'QUOTED'
  if (/(auftr[aä]g|beauftragt|approved|zusage|warteliste|abschlag)/.test(n)) return 'APPROVED'
  if (/(anfrage|lead|neu|eingang|todo|to do|offen)/.test(n)) return 'LEAD'
  return 'LEAD'
}
