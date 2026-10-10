// Parser for Trello's standard board export ("Menu → Print, export and share →
// Export as JSON"). Only the fields we import are read; everything else in the
// (large) file is ignored. The cards' custom fields are read by
// src/lib/trello-fields.ts.

import { cardFields, powerUpFields, type TrelloCardFields } from './trello-fields'

export type TrelloList = { id: string; name: string; closed: boolean }
export type TrelloAttachment = {
  name: string
  url: string
  /** Trello's id of the attachment — what a card names its cover by. */
  id: string
  /** A file kept by Trello (true) or a web address somebody attached (false). */
  isUpload: boolean
  mimeType: string | null
  bytes: number | null
  date: string | null
}
export type TrelloCard = {
  id: string
  name: string
  desc: string
  idList: string
  closed: boolean
  /** When the card was archived, where Trello says so. */
  dateClosed: string | null
  due: string | null
  start: string | null
  /** Trello's tick: the card marked complete. */
  dueComplete: boolean
  labels: string[]
  /** Ids of the board members on the card. */
  members: string[]
  /** Its place in its list, top to bottom. */
  pos: number
  /** Permalink of the card, kept as the project's source link. */
  shortUrl: string
  attachments: TrelloAttachment[]
  /** The attachment shown as the card's cover picture, when it has one. */
  coverAttachmentId: string | null
  /** What the card's custom-fields power-up says: customer, address, order value … (src/lib/trello-fields.ts). Empty where a card says nothing. */
  fields: TrelloCardFields
}
export type TrelloMember = { id: string; name: string }
export type TrelloChecklist = {
  idCard: string
  name: string
  pos: number
  items: Array<{ text: string; done: boolean; pos: number; due: string | null; idMember: string | null }>
}
export type TrelloComment = { id: string; idCard: string; text: string; date: string; author: string; idMember: string | null }
export type TrelloBoard = {
  id: string
  name: string
  lists: TrelloList[]
  cards: TrelloCard[]
  members: TrelloMember[]
  checklists: TrelloChecklist[]
  /**
   * What was said on the cards. Trello's own export holds the last 1000
   * actions of a board only, so on an old board the early comments are not in
   * the file unless it was put together from the API (docs/CHANGE-trello-full-import.md).
   */
  comments: TrelloComment[]
}

type Raw = Record<string, unknown>
const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const strOrNull = (v: unknown) => str(v) || null
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function parseTrelloExport(json: unknown): TrelloBoard | null {
  if (!isRaw(json)) return null
  const raw = json
  if (!Array.isArray(raw.lists) || !Array.isArray(raw.cards)) return null

  const lists: TrelloList[] = raw.lists
    .filter(isRaw)
    // Left to right, the way the board shows them.
    .sort((a, b) => num(a.pos) - num(b.pos))
    .map((l) => ({
      id: String(l.id ?? ''),
      name: String(l.name ?? '').trim(),
      closed: Boolean(l.closed),
    }))
    .filter((l) => l.id && l.name)

  const definitions = powerUpFields(raw.pluginData)
  const cards: TrelloCard[] = raw.cards
    .filter(isRaw)
    .map((c) => ({
      id: String(c.id ?? ''),
      name: String(c.name ?? '').trim(),
      desc: String(c.desc ?? '').trim(),
      idList: String(c.idList ?? ''),
      closed: Boolean(c.closed),
      dateClosed: strOrNull(c.dateClosed),
      due: typeof c.due === 'string' ? c.due : null,
      start: typeof c.start === 'string' ? c.start : null,
      dueComplete: c.dueComplete === true,
      shortUrl: typeof c.shortUrl === 'string' ? c.shortUrl : '',
      labels: Array.isArray(c.labels)
        ? c.labels
            .map((lb) =>
              typeof lb === 'object' && lb !== null ? String((lb as { name?: unknown }).name ?? '') : ''
            )
            .filter(Boolean)
        : [],
      members: Array.isArray(c.idMembers) ? c.idMembers.filter((m): m is string => typeof m === 'string') : [],
      pos: num(c.pos),
      attachments: Array.isArray(c.attachments)
        ? c.attachments
            .filter(isRaw)
            .map((a) => ({
              name: String(a.name ?? '').trim(),
              url: String(a.url ?? '').trim(),
              id: str(a.id),
              isUpload: a.isUpload === true,
              mimeType: strOrNull(a.mimeType),
              bytes: typeof a.bytes === 'number' ? a.bytes : null,
              date: strOrNull(a.date),
            }))
            .filter((a) => a.url)
        : [],
      coverAttachmentId: strOrNull(c.idAttachmentCover) ?? (isRaw(c.cover) ? strOrNull(c.cover.idAttachment) : null),
      fields: cardFields(definitions, c.pluginData),
    }))
    .filter((c) => c.id && c.name)

  const members: TrelloMember[] = (Array.isArray(raw.members) ? raw.members : [])
    .filter(isRaw)
    .map((m) => ({ id: str(m.id), name: str(m.fullName) || str(m.username) }))
    .filter((m) => m.id && m.name)

  const checklists: TrelloChecklist[] = (Array.isArray(raw.checklists) ? raw.checklists : [])
    .filter(isRaw)
    .map((cl) => ({
      idCard: str(cl.idCard),
      name: str(cl.name) || 'Checkliste',
      pos: num(cl.pos),
      items: (Array.isArray(cl.checkItems) ? cl.checkItems : [])
        .filter(isRaw)
        .map((i) => ({ text: str(i.name), done: i.state === 'complete', pos: num(i.pos), due: strOrNull(i.due), idMember: strOrNull(i.idMember) }))
        .filter((i) => i.text)
        .sort((a, b) => a.pos - b.pos),
    }))
    .filter((cl) => cl.idCard && cl.items.length > 0)
    .sort((a, b) => a.pos - b.pos)

  const comments: TrelloComment[] = (Array.isArray(raw.actions) ? raw.actions : [])
    .filter(isRaw)
    .filter((a) => a.type === 'commentCard' && isRaw(a.data))
    .map((a) => {
      const data = a.data as Raw
      const creator = isRaw(a.memberCreator) ? a.memberCreator : {}
      return {
        id: str(a.id),
        idCard: isRaw(data.card) ? str(data.card.id) : str(data.idCard),
        text: str(data.text),
        // A moment Trello wrote; anything that is not one is no comment to keep.
        date: typeof a.date === 'string' && !Number.isNaN(Date.parse(a.date)) ? a.date : '',
        author: str(creator.fullName) || str(creator.username),
        idMember: strOrNull(a.idMemberCreator),
      }
    })
    .filter((c) => c.id && c.idCard && c.text && c.date)
    // Oldest first, the order they were said in.
    .sort((a, b) => a.date.localeCompare(b.date))

  return { id: str(raw.id), name: String(raw.name ?? 'Trello').trim(), lists, cards, members, checklists, comments }
}

/** A Trello download address: the card and the attachment it names. Null for any other address. */
export function trelloDownload(url: string): { cardId: string; attachmentId: string } | null {
  const match = url.match(/^https:\/\/trello\.com\/1\/cards\/([0-9a-f]{24})\/attachments\/([0-9a-f]{24})\/download\//)
  return match ? { cardId: match[1], attachmentId: match[2] } : null
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
 * The checklists of a board as templates: one per name (case does not
 * matter), holding every item that name ever had, in the order the items
 * first appeared — the way a standard checklist that lives on many cards
 * becomes one template to reuse.
 */
export function checklistTemplatesOf(checklists: Array<Pick<TrelloChecklist, 'name' | 'items'>>): Array<{ name: string; items: string[] }> {
  const byName = new Map<string, { name: string; items: string[] }>()
  for (const list of checklists) {
    const key = list.name.toLowerCase()
    const template = byName.get(key) ?? { name: list.name, items: [] }
    for (const item of list.items) {
      if (!template.items.some((known) => known.toLowerCase() === item.text.toLowerCase())) template.items.push(item.text)
    }
    byName.set(key, template)
  }
  return [...byName.values()].filter((t) => t.items.length > 0)
}
