// Parser for Trello's standard board export ("Menu → Print, export and share →
// Export as JSON"). Only the fields we import are read; everything else in the
// (large) file is ignored.

import { cardFields, powerUpFields, type TrelloCardFields } from './trello-fields'

export type TrelloList = { id: string; name: string; closed: boolean }
export type TrelloAttachment = { name: string; url: string }
export type TrelloChecklistItem = { name: string; complete: boolean }
export type TrelloChecklist = { name: string; items: TrelloChecklistItem[] }
/** A comment on a card: when, by whom (as Trello names them), and what. */
export type TrelloComment = { date: string; author: string; text: string }
export type TrelloCard = {
  id: string
  name: string
  desc: string
  idList: string
  closed: boolean
  due: string | null
  /** Trello's tick: the card marked complete. */
  dueComplete: boolean
  labels: string[]
  /** Permalink of the card, kept as the project's source link. */
  shortUrl: string
  attachments: TrelloAttachment[]
  /** The card's checklists, in their order on the card, each item with its tick. */
  checklists: TrelloChecklist[]
  /** The card's comments, oldest first — as far as the export holds them. */
  comments: TrelloComment[]
  /** What the card's custom-fields power-up says: customer, address, order value … (src/lib/trello-fields.ts). */
  fields: TrelloCardFields
}
export type TrelloBoard = {
  name: string
  lists: TrelloList[]
  cards: TrelloCard[]
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * The board's checklists by the card they hang on. Trello keeps them in one
 * list on the board, each with its card's id and a position; the items carry
 * their own position and a state of "complete" or "incomplete".
 */
function checklistsByCard(raw: unknown): Map<string, TrelloChecklist[]> {
  const byCard = new Map<string, Array<TrelloChecklist & { pos: number }>>()
  if (!Array.isArray(raw)) return new Map()
  for (const entry of raw) {
    if (!record(entry)) continue
    const cardId = String(entry.idCard ?? '')
    const name = String(entry.name ?? '').trim()
    if (!cardId || !name) continue
    const items = (Array.isArray(entry.checkItems) ? entry.checkItems : [])
      .filter(record)
      .map((item) => ({ name: String(item.name ?? '').trim(), complete: item.state === 'complete', pos: num(item.pos) }))
      .filter((item) => item.name)
      .sort((a, b) => a.pos - b.pos)
      .map(({ name: itemName, complete }) => ({ name: itemName, complete }))
    const list = byCard.get(cardId) ?? []
    list.push({ name, items, pos: num(entry.pos) })
    byCard.set(cardId, list)
  }
  return new Map(
    [...byCard].map(([cardId, lists]) => [cardId, lists.sort((a, b) => a.pos - b.pos).map(({ name, items }) => ({ name, items }))])
  )
}

/**
 * The comments by card, out of the board's actions — Trello writes a comment
 * as an action of type "commentCard". An export holds the newest thousand or
 * so actions; older comments are simply not in the file.
 */
function commentsByCard(raw: unknown): Map<string, TrelloComment[]> {
  const byCard = new Map<string, TrelloComment[]>()
  if (!Array.isArray(raw)) return byCard
  for (const action of raw) {
    if (!record(action) || action.type !== 'commentCard' || !record(action.data)) continue
    const card = record(action.data.card) ? action.data.card : null
    const cardId = card ? String(card.id ?? '') : ''
    const text = String(action.data.text ?? '').trim()
    const date = typeof action.date === 'string' && !Number.isNaN(Date.parse(action.date)) ? action.date : ''
    if (!cardId || !text || !date) continue
    const creator = record(action.memberCreator) ? action.memberCreator : null
    const author = creator ? String(creator.fullName ?? creator.username ?? '').trim() : ''
    const list = byCard.get(cardId) ?? []
    list.push({ date, author, text })
    byCard.set(cardId, list)
  }
  for (const list of byCard.values()) list.sort((a, b) => a.date.localeCompare(b.date))
  return byCard
}

export function parseTrelloExport(json: unknown): TrelloBoard | null {
  if (!record(json)) return null
  const raw = json
  if (!Array.isArray(raw.lists) || !Array.isArray(raw.cards)) return null

  const lists: TrelloList[] = raw.lists
    .filter(record)
    .map((l) => ({
      id: String(l.id ?? ''),
      name: String(l.name ?? '').trim(),
      closed: Boolean(l.closed),
    }))
    .filter((l) => l.id && l.name)

  const checklists = checklistsByCard(raw.checklists)
  const comments = commentsByCard(raw.actions)
  const definitions = powerUpFields(raw.pluginData)

  const cards: TrelloCard[] = raw.cards
    .filter(record)
    .map((c) => {
      const id = String(c.id ?? '')
      return {
        id,
        name: String(c.name ?? '').trim(),
        desc: String(c.desc ?? '').trim(),
        idList: String(c.idList ?? ''),
        closed: Boolean(c.closed),
        due: typeof c.due === 'string' ? c.due : null,
        dueComplete: c.dueComplete === true,
        shortUrl: typeof c.shortUrl === 'string' ? c.shortUrl : '',
        labels: Array.isArray(c.labels)
          ? c.labels.map((lb) => (record(lb) ? String(lb.name ?? '') : '')).filter(Boolean)
          : [],
        attachments: Array.isArray(c.attachments)
          ? c.attachments
              .filter(record)
              .map((a) => ({ name: String(a.name ?? '').trim(), url: String(a.url ?? '').trim() }))
              .filter((a) => a.url)
          : [],
        checklists: checklists.get(id) ?? [],
        comments: comments.get(id) ?? [],
        fields: cardFields(definitions, c.pluginData),
      }
    })
    .filter((c) => c.id && c.name)

  return { name: String(raw.name ?? 'Trello').trim(), lists, cards }
}

/**
 * When a card came into being. Trello ids start with the creation time in
 * seconds, hex-encoded — the one date every card carries, even when nobody
 * filled in a due date. Null for an id that does not have that shape.
 */
export function cardCreatedAt(id: string): Date | null {
  if (!/^[0-9a-f]{24}$/i.test(id)) return null
  const seconds = parseInt(id.slice(0, 8), 16)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null
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

/**
 * Heuristic default status per Trello list name (German column names). Only a
 * suggestion: the import wizard lets the office change every list's status.
 *
 * A company keeps two kinds of board, and their words overlap: "nachfragen",
 * "Rücksprache", "Ortstermin", "Kalkulation" and "abgelehnt" all turn up on a
 * jobs board too ("Baustelle läuft – Material nachfragen", "Nachtrag abgelehnt").
 * So the order is:
 *
 * 1. Money words, negations first — an unpaid or disputed bill stays a bill.
 * 2. The few phrases that name a sales step outright, even next to a job word:
 *    the first talk with a customer, an offer that is ready.
 * 3. Job-stage words. Where a name has one, it is a jobs-board column, and the
 *    sales words in it describe a side task of the job.
 * 4. Sales words, which decide only when no job word is there.
 */
export function suggestStatus(listName: string): string {
  const n = listName.toLowerCase()

  // 1. Money and endings.
  if (/((nicht|un)\s*bezahlt|offene posten|mahnung)/.test(n)) return 'INVOICED'
  if (/(nicht\s*beauftragt|keine\s*zusage)/.test(n)) return 'CANCELLED'
  if (/(storn|abgesagt|cancel|verloren)/.test(n)) return 'CANCELLED'
  if (/(bezahlt|paid)/.test(n)) return 'PAID'
  if (/(rechnung|abgerechnet|invoic)/.test(n)) return 'INVOICED'

  // 2. Sales steps named outright. "Termin vereinbart / Erstgespräch" is the
  //    first talk, not a planned start; "Angebot fertig" is an offer ready to
  //    send, not finished work.
  if (/erst\s*gespr(ä|ae|a)ch/.test(n)) return 'LEAD'
  if (/angebot\s*(ist\s*)?fertig/.test(n)) return 'QUOTED'

  // 3. Job stages. A site visit ("Ortstermin") is not by itself a planned
  //    start, so it only counts as one next to a job word ("Ortstermin Baubeginn").
  const job = n.replace(/ortstermin/g, ' ')
  if (/(erledigt|fertigstellung|fertig|abgeschlossen|done|complete)/.test(job)) return 'COMPLETED'
  // "Baustellenbeginn" is a start date, not work in progress — check it first.
  if (/(beginn|geplant|termin|planned|planung|vorbereit)/.test(job)) return 'PLANNED'
  // Partial bills, extra work, acceptance and defects all happen while the job
  // is still open; billing it in full would count it as money outstanding.
  if (/(läuft|laufend|in arbeit|progress|aktiv|unterbrech|unterbroch|pause|baustelle|bauleit|abschlag|nachtrag|abnahme|m(ä|ae)ngel)/.test(job))
    return 'IN_PROGRESS'
  // Ordering material and chasing a supplier is getting an order ready.
  if (/(auftr[aä]g|approved|material|lieferant|bestell)/.test(job)) return 'APPROVED'

  // 4. Sales words, where no job word decided.
  if (/abgelehnt/.test(n)) return 'CANCELLED'
  if (/angebot\s*angenommen/.test(n)) return 'APPROVED'
  // Writing, discussing, sending and chasing an offer, and the customer
  // thinking it over or still wanting a site visit: all of it waits on the offer.
  if (/(angebot|quote|kalkul|nachfrag|unentschlossen|ortstermin|r(ü|ue)cksprache|warten auf (zusage|antwort|rückmeldung|bestätigung))/.test(n))
    return 'QUOTED'
  // A waiting list is orders waiting for a crew — unless it is a list of offers.
  if (/(beauftragt|zusage|warteliste)/.test(n)) return 'APPROVED'
  if (/(anfrage|lead|neu|eingang|todo|to do|offen)/.test(n)) return 'LEAD'
  return 'LEAD'
}

/**
 * A Trello comment as it is written onto the project: the text, and under it
 * who said it and when in Trello — the note has no account of its own here.
 */
export function trelloCommentBody(comment: TrelloComment, formatDay: (date: Date) => string): string {
  const who = comment.author || 'Trello'
  return `${comment.text}\n\n— ${who} (Trello, ${formatDay(new Date(comment.date))})`
}

/**
 * The checklists of a board as templates: one per name (case does not
 * matter), holding every item that name ever had, in the order the items
 * first appeared — the way a standard checklist that lives on many cards
 * becomes one template to reuse.
 */
export function checklistTemplatesOf(cards: Array<Pick<TrelloCard, 'checklists'>>): Array<{ name: string; items: string[] }> {
  const byName = new Map<string, { name: string; items: string[] }>()
  for (const card of cards) {
    for (const list of card.checklists) {
      const key = list.name.toLowerCase()
      const template = byName.get(key) ?? { name: list.name, items: [] }
      for (const item of list.items) {
        if (!template.items.some((known) => known.toLowerCase() === item.name.toLowerCase())) template.items.push(item.name)
      }
      byName.set(key, template)
    }
  }
  return [...byName.values()].filter((t) => t.items.length > 0)
}
