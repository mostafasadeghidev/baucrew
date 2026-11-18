/**
 * What a job needs, typed in or pasted as a list: the catalogue of materials
 * and tools (one list for the whole company, kept in the warehouse area), and
 * a project's own needs list picked from it. Machines are not here — they come
 * from Wattro and are picked on the card one by one.
 *
 * Two kinds of list arrive as text:
 * - a catalogue list — kind, name, category, unit … — copied out of Excel
 *   (tabs) or a CSV file (semicolons or commas), with or without a header row;
 * - a needs list for one project — "10 Eimer Dispersionsfarbe", "Malerkrepp:
 *   30 Rollen", "Farbrolle" — one thing per line, as somebody writes it.
 *
 * A catalogue row is the same entry as one already there when kind and name
 * agree (case and doubled spaces do not count); it then only fills what the
 * entry lacks. A needs line finds its catalogue entry by name — exact first,
 * else the one entry that clearly is meant — and says when it found none.
 *
 * Pure: no database — the rules are tested as they are.
 */

import { nameKey } from './import-master'

export type KindEntry = { value: string; labelDe: string; labelEn: string }

const squash = (text: string) =>
  text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[\s._\-/()]+/g, '')

/** The words a kind is written as besides its own value and labels. */
const KIND_WORDS: Record<string, string[]> = {
  MATERIAL: ['material', 'materialien', 'mat', 'verbrauch', 'verbrauchsmaterial', 'materials'],
  TOOL: ['werkzeug', 'werkzeuge', 'wz', 'tool', 'tools', 'handwerkzeug'],
}

/** The kind a cell names — its value, its German or English label, or a usual word for it — or null. */
export function resolveKind(cell: string | null | undefined, kinds: KindEntry[]): string | null {
  const key = squash(cell ?? '')
  if (!key) return null
  for (const kind of kinds) {
    const words = [kind.value, kind.labelDe, kind.labelEn, ...(KIND_WORDS[kind.value] ?? [])].map(squash)
    if (words.includes(key)) return kind.value
  }
  return null
}

// ── Splitting pasted text ─────────────────────────────────────────

/** One line split at a delimiter, quotes respected ("a;b" stays one cell, "" is a quote). */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delimiter) {
      cells.push(cell.trim())
      cell = ''
    } else cell += ch
  }
  cells.push(cell.trim())
  return cells
}

/**
 * The delimiter a pasted table uses: Excel copies tabs; a German CSV uses
 * semicolons; commas only when every line has one that is no decimal comma
 * ("2,5" is a number, not two cells).
 */
export function detectDelimiter(lines: string[]): '\t' | ';' | ',' | null {
  if (lines.some((l) => l.includes('\t'))) return '\t'
  if (lines.some((l) => l.includes(';'))) return ';'
  if (lines.length > 0 && lines.every((l) => /,(?!\d)/.test(l))) return ','
  return null
}

/** Pasted text as rows of cells; empty lines dropped. One column when there is no delimiter. */
export function splitTable(text: string): string[][] {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
  const delimiter = detectDelimiter(lines)
  return lines.map((l) => (delimiter ? splitLine(l, delimiter) : [l.trim()]))
}

// ── The catalogue list ────────────────────────────────────────────

export const CATALOG_FIELDS = ['kind', 'name', 'category', 'unit', 'location', 'notes'] as const
export type CatalogField = (typeof CATALOG_FIELDS)[number]

const HEADER_WORDS: Record<CatalogField, string[]> = {
  kind: ['art', 'typ', 'kind', 'type', 'sorte'],
  name: ['name', 'bezeichnung', 'artikel', 'artikelname', 'artikelbezeichnung', 'item', 'beschreibung'],
  category: ['kategorie', 'gruppe', 'warengruppe', 'category', 'group', 'bereich'],
  unit: ['einheit', 'me', 'mengeneinheit', 'unit', 'eh'],
  location: ['lagerort', 'lager', 'platz', 'location', 'regal'],
  notes: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'notes', 'hinweis', 'kommentar'],
}

/** Which column holds which field, when the row names them (a header row); null when it is data. */
export function headerColumns(row: string[]): Partial<Record<CatalogField, number>> | null {
  const columns: Partial<Record<CatalogField, number>> = {}
  row.forEach((cell, index) => {
    const key = squash(cell)
    for (const field of CATALOG_FIELDS) {
      if (columns[field] === undefined && (key === field || HEADER_WORDS[field].includes(key))) {
        columns[field] = index
        return
      }
    }
  })
  return columns.name !== undefined ? columns : null
}

export type CatalogRow = {
  /** Line of the pasted text (1 = the first), for the preview and the errors. */
  line: number
  kind: string
  name: string
  category: string | null
  unit: string | null
  location: string | null
  notes: string | null
}

export type CatalogIssue = { line: number; problem: 'noName' | 'unknownKind'; text: string }

const cut = (value: string | undefined, max: number) => {
  const text = (value ?? '').trim().replace(/\s+/g, ' ')
  return text ? text.slice(0, max) : null
}

/**
 * Rows of a pasted table as catalogue entries. With a header row the columns
 * are found by their names; without one the order is kind, name, category,
 * unit, location, notes — or, when the first column is no kind, name first and
 * every entry of `defaultKind`.
 */
export function readCatalogTable(
  table: string[][],
  kinds: KindEntry[],
  defaultKind: string
): { rows: CatalogRow[]; issues: CatalogIssue[]; hasHeader: boolean } {
  const header = table.length > 0 ? headerColumns(table[0]) : null
  const body = header ? table.slice(1) : table
  const firstLine = header ? 2 : 1
  let columns: Partial<Record<CatalogField, number>>
  if (header) columns = header
  else {
    const kindFirst = body.filter((r) => r.length > 1 && resolveKind(r[0], kinds)).length * 2 >= body.length && body.length > 0
    columns = kindFirst
      ? { kind: 0, name: 1, category: 2, unit: 3, location: 4, notes: 5 }
      : { name: 0, category: 1, unit: 2, location: 3, notes: 4 }
  }
  const at = (row: string[], field: CatalogField) => {
    const index = columns[field]
    return index === undefined ? undefined : row[index]
  }

  const rows: CatalogRow[] = []
  const issues: CatalogIssue[] = []
  body.forEach((row, i) => {
    const line = firstLine + i
    const text = row.filter(Boolean).join(' · ')
    const name = cut(at(row, 'name'), 200)
    if (!name) {
      issues.push({ line, problem: 'noName', text })
      return
    }
    const kindCell = at(row, 'kind')
    const kind = kindCell?.trim() ? resolveKind(kindCell, kinds) : defaultKind
    if (!kind) {
      issues.push({ line, problem: 'unknownKind', text })
      return
    }
    rows.push({
      line,
      kind,
      name,
      category: cut(at(row, 'category'), 120),
      unit: cut(at(row, 'unit'), 40),
      location: cut(at(row, 'location'), 120),
      notes: cut(at(row, 'notes'), 2000),
    })
  })
  return { rows, issues, hasHeader: header !== null }
}

/** How an entry is found among the ones already there: kind and name. */
export const catalogKey = (kind: string, name: string) => `${kind}|${nameKey(name)}`

export type ExistingCatalogItem = {
  id: string
  kind: string
  name: string
  category: string | null
  unit: string | null
  location: string | null
  notes: string | null
}

const FILLABLE = ['category', 'unit', 'location', 'notes'] as const

export type CatalogPlanEntry = CatalogRow & {
  /** create: new · fill: there, gets what it lacks · same: there, nothing to add · repeat: twice in the list */
  action: 'create' | 'fill' | 'same' | 'repeat'
  existingId: string | null
  /** The fields a `fill` writes. */
  fills: Partial<Record<(typeof FILLABLE)[number], string>>
}

/**
 * What importing the rows would do. Nothing the office typed is overwritten:
 * an entry already there only gets the fields it has empty.
 */
export function planCatalogImport(rows: CatalogRow[], existing: ExistingCatalogItem[]): CatalogPlanEntry[] {
  const byKey = new Map(existing.map((item) => [catalogKey(item.kind, item.name), item]))
  const seen = new Set<string>()
  return rows.map((row) => {
    const key = catalogKey(row.kind, row.name)
    if (seen.has(key)) return { ...row, action: 'repeat', existingId: null, fills: {} }
    seen.add(key)
    const found = byKey.get(key)
    if (!found) return { ...row, action: 'create', existingId: null, fills: {} }
    const fills: CatalogPlanEntry['fills'] = {}
    for (const field of FILLABLE) {
      const value = row[field]
      if (value && !found[field]?.trim()) fills[field] = value
    }
    return { ...row, action: Object.keys(fills).length > 0 ? 'fill' : 'same', existingId: found.id, fills }
  })
}

export type CatalogPlanSummary = { create: number; fill: number; same: number; repeat: number }

export function summarizePlan(plan: CatalogPlanEntry[]): CatalogPlanSummary {
  const summary: CatalogPlanSummary = { create: 0, fill: 0, same: 0, repeat: 0 }
  for (const entry of plan) summary[entry.action]++
  return summary
}

// ── A project's needs list ────────────────────────────────────────

/** Words that stand next to a quantity as its unit ("10 Eimer", "3 Rollen") — not sizes like mm. */
const UNIT_WORDS = new Set([
  'x', '×', 'stk', 'stück', 'stueck', 'st', 'pcs',
  'l', 'liter', 'ltr', 'ml', 'kg', 'g', 't',
  'm', 'meter', 'lfm', 'm²', 'm2', 'qm', 'm³', 'm3',
  'eimer', 'gebinde', 'kanister', 'dose', 'dosen',
  'rolle', 'rollen', 'sack', 'säcke', 'saecke', 'beutel',
  'paket', 'pakete', 'packung', 'packungen', 'pck', 'pkg', 'pack',
  'karton', 'kartons', 'kiste', 'kisten', 'palette', 'paletten',
  'platte', 'platten', 'tafel', 'tafeln', 'bund', 'satz', 'set', 'sets', 'paar',
  'kartusche', 'kartuschen', 'tube', 'tuben',
])
const isUnitWord = (word: string | undefined) => !!word && UNIT_WORDS.has(word.toLowerCase().replace(/\.$/, ''))
const isTimes = (word: string | undefined) => !!word && /^(?:x|×)$/i.test(word)

const NUMBER = /^\d+(?:[.,]\d+)?$/
const toNumber = (text: string) => Number(text.replace(',', '.'))

/** The unit as it is written, without a closing dot. */
const unitOf = (word: string) => word.replace(/\.$/, '')

export type NeedLine = {
  line: number
  /** The line as it was written, for the preview. */
  text: string
  name: string
  quantity: number | null
  /** The unit the line names ("Eimer"), used for an entry made from it. */
  unit: string | null
  note: string | null
  /** A kind the line names in a column of its own, when pasted as a table. */
  kind: string | null
}

type ParsedNeed = Omit<NeedLine, 'line' | 'kind'>

/** One written line — "10 Eimer Tiefgrund", "Malerkrepp: 30 Rollen", "2x Farbrolle (Ersatz)". */
export function parseNeedText(raw: string): ParsedNeed | null {
  const text = raw.trim()
  // Bullets and list numbers: "- ", "• ", "* ", "1) " — "1. " only before a letter.
  let rest = text.replace(/^(?:[-–•*·]\s*|\d+\)\s+|\d+\.\s+(?=\p{L}))/u, '').trim()
  let note: string | null = null
  const bracket = rest.match(/^(.*\S)\s*\(([^()]*)\)$/)
  if (bracket) {
    rest = bracket[1].trim()
    note = bracket[2].trim() || null
  }
  if (!rest) return null

  let quantity: number | null = null
  let unit: string | null = null
  let name = rest
  const words = rest.split(/\s+/)
  const glued = (word: string) => word.match(/^(\d+(?:[.,]\d+)?)(x|×|[a-zäöü²³]+\.?)$/i)

  const first = words[0]
  const firstGlued = glued(first)
  if (words.length > 1 && NUMBER.test(first)) {
    // "10 Eimer Tiefgrund", "10 x Malerkrepp", "3 Farbrollen"
    quantity = toNumber(first)
    if (words.length > 2 && (isUnitWord(words[1]) || isTimes(words[1]))) {
      if (!isTimes(words[1])) unit = unitOf(words[1])
      name = words.slice(2).join(' ')
    } else name = words.slice(1).join(' ')
  } else if (words.length > 1 && firstGlued && (isTimes(firstGlued[2]) || isUnitWord(firstGlued[2]))) {
    // "10x Malerkrepp", "5l Tiefgrund"
    quantity = toNumber(firstGlued[1])
    if (!isTimes(firstGlued[2])) unit = unitOf(firstGlued[2])
    name = words.slice(1).join(' ')
  } else {
    // Quantity last, only when it clearly is one: after a colon or a dash, with a unit, or with an x.
    const marked = rest.match(/^(.+?)\s*(?::|\s[-–=])\s*(\d+(?:[.,]\d+)?)\s*([^\s\d]\S*)?$/)
    const last = words[words.length - 1]
    const beforeLast = words[words.length - 2]
    const lastGlued = glued(last)
    if (marked && (!marked[3] || isUnitWord(marked[3]) || isTimes(marked[3]))) {
      name = marked[1]
      quantity = toNumber(marked[2])
      if (marked[3] && !isTimes(marked[3])) unit = unitOf(marked[3])
    } else if (words.length > 2 && NUMBER.test(beforeLast) && (isUnitWord(last) || isTimes(last))) {
      // "Malerkrepp 30 Rollen", "Farbrolle 2 x"
      quantity = toNumber(beforeLast)
      if (!isTimes(last)) unit = unitOf(last)
      name = words.slice(0, -2).join(' ')
    } else if (words.length > 1 && lastGlued && (isTimes(lastGlued[2]) || isUnitWord(lastGlued[2]))) {
      // "Farbrolle 2x", "Tiefgrund 10l"
      quantity = toNumber(lastGlued[1])
      if (!isTimes(lastGlued[2])) unit = unitOf(lastGlued[2])
      name = words.slice(0, -1).join(' ')
    } else if (words.length > 2 && isTimes(beforeLast) && NUMBER.test(last)) {
      // "Farbrolle x 2"
      quantity = toNumber(last)
      name = words.slice(0, -2).join(' ')
    }
  }
  name = name.replace(/[:\s]+$/, '').trim()
  if (!name) return null
  if (quantity != null && !(Number.isFinite(quantity) && quantity >= 0 && quantity <= 999_999_999)) quantity = null
  return { text, name: name.slice(0, 200), quantity, unit: unit ? unit.slice(0, 40) : null, note: note ? note.slice(0, 500) : null }
}

/**
 * A pasted needs list, one thing per line. Copied out of a sheet (tabs or
 * semicolons) the cells are read for what they are: a number is the quantity,
 * a unit word right after it the unit, a kind word the kind, the first other
 * cell the name and the rest the note. A header row is left out.
 */
export function parseNeedsList(text: string, kinds: KindEntry[]): NeedLine[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const nonEmpty = lines.filter((l) => l.trim() !== '')
  const delimiter = nonEmpty.some((l) => l.includes('\t')) ? '\t' : nonEmpty.some((l) => l.includes(';')) ? ';' : null
  const out: NeedLine[] = []
  lines.forEach((raw, i) => {
    if (raw.trim() === '') return
    const line = i + 1
    const cells = delimiter ? splitLine(raw, delimiter).filter((c) => c !== '') : []
    if (cells.length < 2) {
      const parsed = parseNeedText(cells[0] ?? raw)
      if (parsed) out.push({ ...parsed, line, kind: null })
      return
    }
    if (cells.every((c) => !NUMBER.test(c)) && (headerColumns(cells) || cells.some((c) => ['menge', 'anzahl', 'quantity', 'qty'].includes(squash(c))))) return
    let quantity: number | null = null
    let unit: string | null = null
    let kind: string | null = null
    const named: string[] = []
    cells.forEach((cell, index) => {
      if (quantity == null && NUMBER.test(cell)) quantity = toNumber(cell)
      else if (quantity != null && unit == null && index > 0 && NUMBER.test(cells[index - 1]) && isUnitWord(cell)) unit = unitOf(cell)
      else if (kind == null && resolveKind(cell, kinds)) kind = resolveKind(cell, kinds)
      else named.push(cell)
    })
    const [name, ...rest] = named
    if (!name) return
    out.push({ line, text: raw.trim(), name: name.slice(0, 200), quantity, unit, note: rest.join(' · ').slice(0, 500) || null, kind })
  })
  return out
}

export type CatalogRef = { id: string; kind: string; name: string; unit: string | null }

export type NeedMatch = {
  /** The entry meant, when there is exactly one. */
  item: CatalogRef | null
  how: 'exact' | 'close' | null
  /** Entries it might be, when more than one fits — for the person to choose. */
  candidates: CatalogRef[]
}

/** A name without the endings German plurals add ("Farbrollen" → "farbroll", "Pinsel" → "pinsel"). */
const stem = (text: string) =>
  nameKey(text)
    .replace(/ß/g, 'ss')
    .split(' ')
    .map((word) => (word.length > 4 ? word.replace(/(?:en|er|e|n|s)$/, '') : word))
    .join(' ')

/**
 * The catalogue entry a written name means: the same name; else the same
 * name without plural endings; else the one entry whose name holds the
 * written one as whole words, or is held by it. A kind named on the line
 * narrows the choice. When several fit, they are offered, none is guessed.
 */
export function matchNeed(need: Pick<NeedLine, 'name' | 'kind'>, catalog: CatalogRef[]): NeedMatch {
  const pool = need.kind ? catalog.filter((c) => c.kind === need.kind) : catalog
  const none: NeedMatch = { item: null, how: null, candidates: [] }
  const pick = (hits: CatalogRef[], how: 'exact' | 'close'): NeedMatch | null => {
    if (hits.length === 1) return { item: hits[0], how, candidates: [] }
    if (hits.length > 1) return { item: null, how: null, candidates: hits.slice(0, 8) }
    return null
  }
  const key = nameKey(need.name)
  const exact = pick(pool.filter((c) => nameKey(c.name) === key), 'exact')
  if (exact) return exact
  const s = stem(need.name)
  const stemmed = pick(pool.filter((c) => stem(c.name) === s), 'close')
  if (stemmed) return stemmed
  if (s.length < 4) return none
  const padded = ` ${s} `
  const near = pool.filter((c) => {
    const other = stem(c.name)
    return other.length >= 4 && (` ${other} `.includes(padded) || padded.includes(` ${other} `))
  })
  return pick(near, 'close') ?? none
}

/** The order the kinds stand in on a card: material first, then tools, then the company's own kinds. */
export function kindOrder<T extends { value: string }>(kinds: T[]): T[] {
  const rank = (value: string) => (value === 'MATERIAL' ? 0 : value === 'TOOL' ? 1 : 2)
  return [...kinds].sort((a, b) => rank(a.value) - rank(b.value))
}
