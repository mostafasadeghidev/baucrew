/**
 * Forms on a project — an acceptance protocol, say: a template the office
 * builds once, filled in per project with what the project already knows put
 * in, signed on a phone or a tablet, and kept on the project as a PDF.
 *
 * A form carries its own copy of the template's fields and signers, taken the
 * moment it is made: a template edited next year must not rewrite a protocol
 * signed this year.
 *
 * Signing locks the form. What was signed is a digest of its fields and
 * values, kept with every signature, so a form whose content no longer fits
 * its signatures can be told — and as long as one signature stands, nothing in
 * it can be changed at all.
 *
 * Pure: no database, no React, no Node — the browser reads these rules too.
 */

export const FIELD_TYPES = [
  'heading',
  'info',
  'text',
  'longtext',
  'number',
  'date',
  'checkbox',
  'choice',
  'multi',
  'table',
  'photo',
  'signatures',
  'pagebreak',
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

/**
 * The kinds that hold nothing: a heading, a fixed text (the conditions of a
 * contract, a note to the reader), the place where signatures stand, and the
 * start of a new page.
 */
export const LAYOUT_TYPES: ReadonlySet<FieldType> = new Set(['heading', 'info', 'signatures', 'pagebreak'])

/** What a field can be filled with from the project when the form is made. */
export const PREFILL_SOURCES = [
  'projectNumber',
  'projectName',
  'customerName',
  'customerNumber',
  'siteAddress',
  'manager',
  'workTypes',
  'today',
  'openDefects',
  'companyName',
  'jobNumber',
  'customerWithAddress',
  'customerAddress',
  'customerStreet',
  'customerTown',
  'customerPhone',
  'customerEmail',
  'siteCity',
  'placeToday',
  'plannedStart',
  'plannedEnd',
  'dueDate',
] as const
export type PrefillSource = (typeof PREFILL_SOURCES)[number]

export type FormField = {
  id: string
  type: FieldType
  /** What the field is called; the title of an `info` (may be empty), the line a `checkbox` ticks. */
  label: string
  required?: boolean
  /**
   * The answers of a `choice` or a `multi`; the columns of a `table`; the
   * signers (by their role) whose boxes a `signatures` stands for — none means
   * everybody not placed elsewhere.
   */
  options?: string[]
  prefill?: PrefillSource
  /** The fixed text of an `info`, as it stands: paragraphs, and lines starting with "• " or "- " as a list. */
  body?: string
  /** What is written after the value — a unit, or the rest of the sentence the value stands in: "mm", "erfolgen.". */
  suffix?: string
  /** What the field holds when the project has nothing for it — the company's own address, say. */
  defaultValue?: string
  /** Half the width: two half fields in a row stand side by side, on the screen and on paper. */
  half?: boolean
  /**
   * A `table`'s rows, given by the template: the table has exactly these, a
   * cell with text in it is fixed, an empty one is filled in.
   */
  rows?: string[][]
  /** A `table`'s column widths, relative to each other: [3, 1] is three quarters and one. */
  widths?: number[]
}

/**
 * What a field holds: a text for most, true or false for a checkbox, the
 * chosen answers of a `multi` and the photos' document ids of a `photo` as a
 * list, the rows of a `table` as a list of lists (one text per column).
 */
export type FormValue = string | boolean | string[] | string[][]
export type FormValues = Record<string, FormValue>

export const FORM_NAME_MAX = 200
/** Long enough for a contract's clause ticked as a whole. */
export const FIELD_LABEL_MAX = 600
export const FIELD_TEXT_MAX = 300
export const FIELD_LONGTEXT_MAX = 5000
/** A fixed text: a contract's longest clause fits several times over. */
export const INFO_TEXT_MAX = 8000
export const SUFFIX_MAX = 120
export const MAX_FIELDS = 250
export const MAX_OPTIONS = 12
/** The columns a table may have, and the rows a filled one may hold. */
export const MAX_COLUMNS = 6
export const MAX_ROWS = 40
/** The photos one field may carry. */
export const MAX_PHOTOS = 12
export const MAX_SIGNERS = 4
export const SIGNER_MAX = 80
/** A drawn signature as a PNG, base64: a few kilobytes; this is a generous ceiling. */
export const SIGNATURE_MAX_BASE64 = 400_000

/** A number as it is typed in German or English: "1.250,50", "12,5", "-3", "0.75". */
const NUMBER = /^-?\d{1,3}(\.\d{3})*(,\d{1,4})?$|^-?\d{1,12}([.,]\d{1,4})?$/
/** A document's id, the way the database makes them. */
const DOCUMENT_ID = /^[a-z0-9]{10,40}$/

/** The types whose value is typed with the project's words put in first. */
export const PREFILLABLE: ReadonlySet<FieldType> = new Set(['text', 'longtext', 'date', 'choice', 'multi', 'table'])
/** The types that carry answers or columns. */
export const WITH_OPTIONS: ReadonlySet<FieldType> = new Set(['choice', 'multi', 'table'])
/** The types with a text after the value. */
export const WITH_SUFFIX: ReadonlySet<FieldType> = new Set(['text', 'number', 'date'])
/** The types a template can give a value of its own. */
export const WITH_DEFAULT: ReadonlySet<FieldType> = new Set(['text', 'longtext', 'number', 'choice'])
/** The types that can stand at half the width. */
export const HALF_WIDTH: ReadonlySet<FieldType> = new Set(['text', 'longtext', 'number', 'date', 'checkbox', 'choice', 'multi'])
/**
 * The types that need no label: the text of an `info` is its body, an unnamed
 * choice is its answers, lines or a table under a heading are that heading's.
 * A text, number or date needs one unless the words after it say what it is
 * ("____ Euro netto").
 */
const LABEL_OPTIONAL: ReadonlySet<FieldType> = new Set(['info', 'signatures', 'pagebreak', 'choice', 'multi', 'longtext', 'table'])
/** The prefills that are a day — written the German way when the field is a text. */
const DAY_SOURCES: ReadonlySet<PrefillSource> = new Set(['today', 'plannedStart', 'plannedEnd', 'dueDate'])

const isType = (v: unknown): v is FieldType => (FIELD_TYPES as readonly unknown[]).includes(v)
const isPrefill = (v: unknown): v is PrefillSource => (PREFILL_SOURCES as readonly unknown[]).includes(v)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
/** A text of several lines: line ends kept as "\n", the soft hyphens a word processor leaves in taken out. */
const longText = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/\u00ad/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, max) : ''

/**
 * The fields of a template as the editor sends them, put in order: unknown
 * types and empty labels dropped, options only where they mean something, ids
 * kept where they are usable and made where they are not — an id is what a
 * value hangs on, so it must survive an edit of the label.
 */
export function parseFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return []
  const taken = new Set<string>()
  const fields: FormField[] = []
  for (const item of raw.slice(0, MAX_FIELDS)) {
    if (typeof item !== 'object' || item === null) continue
    const source = item as Record<string, unknown>
    if (!isType(source.type)) continue
    const type = source.type
    const label = text(source.label, FIELD_LABEL_MAX)
    const body = type === 'info' ? longText(source.body, INFO_TEXT_MAX) : ''
    const suffix = WITH_SUFFIX.has(type) ? text(source.suffix, SUFFIX_MAX) : ''
    if (type === 'info' ? !label && !body : !label && !suffix && !LABEL_OPTIONAL.has(type)) continue
    let id = typeof source.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(source.id) ? source.id : ''
    if (!id || taken.has(id)) {
      let n = fields.length + 1
      while (taken.has(`f${n}`)) n++
      id = `f${n}`
    }
    const field: FormField = { id, type, label }
    if (!LAYOUT_TYPES.has(type)) {
      if (source.required === true) field.required = true
      if (isPrefill(source.prefill) && PREFILLABLE.has(type)) field.prefill = source.prefill
    }
    if (body) field.body = body
    if (WITH_OPTIONS.has(type) || type === 'signatures') {
      const max = type === 'table' ? MAX_COLUMNS : type === 'signatures' ? MAX_SIGNERS : MAX_OPTIONS
      const options = Array.isArray(source.options)
        ? [...new Set(source.options.map((o) => text(o, FIELD_TEXT_MAX)).filter(Boolean))].slice(0, max)
        : []
      if (options.length === 0 && type !== 'signatures') continue
      if (options.length > 0) field.options = options
    }
    if (type === 'table') {
      const columns = field.options!.length
      if (Array.isArray(source.rows)) {
        const rows = source.rows
          .filter(Array.isArray)
          .slice(0, MAX_ROWS)
          .map((row) => Array.from({ length: columns }, (_, i) => text(row[i], FIELD_TEXT_MAX)))
        if (rows.length > 0) field.rows = rows
      }
      if (Array.isArray(source.widths)) {
        const widths = source.widths.slice(0, columns).map((w) => (typeof w === 'number' && w > 0 && w <= 100 ? w : 1))
        if (widths.length === columns && widths.some((w) => w !== widths[0])) field.widths = widths
      }
    }
    if (suffix) field.suffix = suffix
    if (WITH_DEFAULT.has(type)) {
      const value = type === 'longtext' ? longText(source.defaultValue, FIELD_LONGTEXT_MAX) : text(source.defaultValue, FIELD_TEXT_MAX)
      if (value && (type !== 'choice' || field.options?.includes(value))) field.defaultValue = value
    }
    if (source.half === true && HALF_WIDTH.has(type)) field.half = true
    taken.add(id)
    fields.push(field)
  }
  return fields
}

/** Who signs, in order — at least nobody, at most four, each named once. */
export function parseSigners(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((s) => text(s, SIGNER_MAX)).filter(Boolean))].slice(0, MAX_SIGNERS)
}

/** What the project knows, in words, for the fields that ask for it. */
export type PrefillContext = Partial<Record<PrefillSource, string>>

/** What an untouched field holds; a table with rows of its own holds those. */
export function emptyValue(type: FieldType, field?: FormField): FormValue {
  if (type === 'checkbox') return false
  if (type === 'table') return field?.rows ? field.rows.map((row) => [...row]) : []
  if (type === 'multi' || type === 'photo') return []
  return ''
}

/** "2026-11-03" as it is written on a German sheet. */
export function germanDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : iso
}

/** One field's start from what the project knows, or from the template's own value. */
function prefillOne(field: FormField, context: PrefillContext): FormValue {
  const known = field.prefill ? (context[field.prefill] ?? '') : ''
  if (field.type === 'multi' || field.type === 'choice') {
    // The project's words that are answers of the field: its trades ticked among "Maler, Trockenbau, …" —
    // one word the start of the other counts, so the trade "Malern" ticks the answer "Maler".
    const words = known.split(/,|\n/).map((w) => w.trim().toLowerCase()).filter(Boolean)
    const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)))
    const hits = (field.options ?? []).filter((o) => words.some((w) => same(w, o.toLowerCase())))
    if (field.type === 'multi') return hits
    return hits[0] ?? (field.options?.includes(known) ? known : (field.defaultValue ?? ''))
  }
  if (field.type === 'table') {
    if (field.rows) return emptyValue('table', field)
    // One line of the project's, one row: the open defects down the first column.
    const columns = field.options?.length ?? 0
    return known
      .split('\n')
      .map((line) => line.replace(/^[–•-]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, MAX_ROWS)
      .map((line) => Array.from({ length: columns }, (_, i) => (i === 0 ? line.slice(0, FIELD_TEXT_MAX) : '')))
  }
  if (!known) return field.defaultValue ?? emptyValue(field.type, field)
  if (field.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(known) ? known : ''
  // A one-line field gets several lines as one, and a day the way a reader writes it.
  if (field.type !== 'longtext') return (field.prefill && DAY_SOURCES.has(field.prefill) ? germanDay(known) : known).replace(/\s*\n+\s*/g, ', ')
  return known
}

/** The values a new form starts with. */
export function prefillValues(fields: FormField[], context: PrefillContext): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    if (LAYOUT_TYPES.has(field.type)) continue
    values[field.id] = prefillOne(field, context)
  }
  return values
}

const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

/**
 * What was sent for a form, held against its fields: only fields the form has,
 * a checkbox true or false, a date a date, a number a number, a choice one of
 * its answers, a multi some of them in their order, a table its rows with one
 * text per column, a photo its documents' ids, a text no longer than it may
 * be.
 */
export function cleanValues(fields: FormField[], raw: unknown): FormValues {
  const sent = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const values: FormValues = {}
  for (const field of fields) {
    if (LAYOUT_TYPES.has(field.type)) continue
    const value = sent[field.id]
    if (field.type === 'checkbox') {
      values[field.id] = value === true || value === 'on' || value === 'true'
    } else if (field.type === 'date') {
      const day = text(value, 10)
      values[field.id] = /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : ''
    } else if (field.type === 'number') {
      const typed = text(value, 24).replace(/\s/g, '')
      values[field.id] = NUMBER.test(typed) ? typed : ''
    } else if (field.type === 'choice') {
      const answer = text(value, FIELD_TEXT_MAX)
      values[field.id] = field.options?.includes(answer) ? answer : ''
    } else if (field.type === 'multi') {
      const chosen = new Set(stringList(value).map((v) => v.trim()))
      values[field.id] = (field.options ?? []).filter((o) => chosen.has(o))
    } else if (field.type === 'photo') {
      values[field.id] = [...new Set(stringList(value).filter((id) => DOCUMENT_ID.test(id)))].slice(0, MAX_PHOTOS)
    } else if (field.type === 'table' && field.rows) {
      // The template's rows, each once and in its order: its own words stand, the gaps hold what was written.
      const sentRows = Array.isArray(value) ? value : []
      values[field.id] = field.rows.map((preset, r) => {
        const row: unknown[] = Array.isArray(sentRows[r]) ? sentRows[r] : []
        return preset.map((cell, c) => cell || text(row[c], FIELD_TEXT_MAX))
      })
    } else if (field.type === 'table') {
      const columns = field.options?.length ?? 0
      const rows = (Array.isArray(value) ? value : [])
        .filter(Array.isArray)
        .map((row) => Array.from({ length: columns }, (_, i) => text(row[i], FIELD_TEXT_MAX)))
        // A row nobody wrote into is no row.
        .filter((row) => row.some(Boolean))
        .slice(0, MAX_ROWS)
      values[field.id] = rows
    } else {
      values[field.id] = field.type === 'longtext' ? longText(value, FIELD_LONGTEXT_MAX) : text(value, FIELD_TEXT_MAX)
    }
  }
  return values
}

/**
 * The number fields something was typed into that is not a number ("12 m²",
 * "ca. 12"), by their labels. Saving would empty them — a signed sheet would
 * show a gap where the person saw a figure — so the form says which instead.
 */
export function badNumbers(fields: FormField[], raw: unknown): string[] {
  const sent = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return fields
    .filter((field) => field.type === 'number')
    .filter((field) => {
      const typed = text(sent[field.id], 24).replace(/\s/g, '')
      return typed !== '' && !NUMBER.test(typed)
    })
    .map((field) => fieldName(fields, field))
}

/** Whether a field holds nothing yet. A table of the template's own rows is empty while none of its gaps is filled. */
export function isEmptyValue(value: FormValue | undefined, field?: FormField): boolean {
  if (value === undefined) return true
  if (field?.type === 'table' && field.rows && Array.isArray(value)) {
    return !(value as string[][]).some((row, r) => row.some((cell, c) => cell && !field.rows![r]?.[c]))
  }
  if (Array.isArray(value)) return value.length === 0
  return value === false || value === ''
}

/** The required fields that are still empty — a checkbox that must be ticked counts. */
export function missingRequired(fields: FormField[], values: FormValues): FormField[] {
  return fields.filter((field) => field.required && !LAYOUT_TYPES.has(field.type) && isEmptyValue(values[field.id], field))
}

/**
 * What a field is called where it has to be named — in "please fill in …":
 * its label, or for an unnamed choice the heading it stands under.
 */
export function fieldName(fields: FormField[], field: FormField): string {
  if (field.label) return field.label
  if (field.suffix) return field.suffix
  const at = fields.indexOf(field)
  for (let i = at - 1; i >= 0; i--) if (fields[i].type === 'heading') return fields[i].label
  return field.options?.[0] ?? field.id
}

/**
 * Which signer's box stands where: a `signatures` field takes the roles it
 * names, or — naming none — everybody not placed by another; whoever is
 * placed nowhere stands at the end, under all fields (key "end").
 */
export function signaturePlaces(fields: FormField[], signers: string[]): Map<string, number[]> {
  const places = new Map<string, number[]>()
  const placed = new Set<number>()
  const blocks = fields.filter((f) => f.type === 'signatures')
  for (const block of blocks) {
    if (!block.options) continue
    const slots = block.options.map((role) => signers.indexOf(role)).filter((slot) => slot >= 0 && !placed.has(slot))
    slots.forEach((slot) => placed.add(slot))
    places.set(block.id, slots)
  }
  for (const block of blocks) {
    if (block.options) continue
    const slots = signers.map((_, slot) => slot).filter((slot) => !placed.has(slot))
    slots.forEach((slot) => placed.add(slot))
    places.set(block.id, slots)
  }
  places.set('end', signers.map((_, slot) => slot).filter((slot) => !placed.has(slot)))
  return places
}

export type FormStatus = 'draft' | 'partly' | 'signed'

/** Nobody has signed, some have, or everybody the form names. A form nobody signs is a draft until it is locked by hand — it never is. */
export function formStatus(signers: string[], signedSlots: number[]): FormStatus {
  const signed = new Set(signedSlots.filter((slot) => slot >= 0 && slot < signers.length))
  if (signed.size === 0) return 'draft'
  return signed.size >= signers.length ? 'signed' : 'partly'
}

/**
 * What a signature signs, as one string: the title, every field with its
 * value in the form's order, and who signs. Stable — the same form gives the
 * same string whatever order its values were stored in.
 */
export function signedContent(title: string, fields: FormField[], values: FormValues, signers: string[]): string {
  return JSON.stringify({
    title,
    fields: fields.map((f) => {
      const entry: unknown[] = [f.id, f.type, f.label, LAYOUT_TYPES.has(f.type) ? null : (values[f.id] ?? emptyValue(f.type, f))]
      // What else the sheet says around the value — a clause's text, the words after a blank, a table's fixed
      // rows — is signed too. Only where a field has it: a form without these signs exactly as it always has.
      const words: Record<string, unknown> = {}
      if (f.body) words.body = f.body
      if (f.suffix) words.suffix = f.suffix
      if (f.rows) words.rows = f.rows
      if (f.type === 'signatures' && f.options) words.options = f.options
      if (Object.keys(words).length > 0) entry.push(words)
      return entry
    }),
    signers,
  })
}

/** A value as a reader sees it on paper; a table and a photo are drawn, not written, so they say how many rows or photos. */
export function displayValue(
  field: FormField,
  value: FormValue | undefined,
  words: { yes: string; no: string; rows?: (count: number) => string; photos?: (count: number) => string },
  formatDay: (iso: string) => string
): string {
  if (field.type === 'checkbox') return value === true ? words.yes : words.no
  if (field.type === 'date') return typeof value === 'string' && value ? formatDay(value) : ''
  if (field.type === 'multi') return Array.isArray(value) ? (value as string[]).join(', ') : ''
  if (field.type === 'table') return Array.isArray(value) ? (words.rows ? words.rows(value.length) : String(value.length)) : ''
  if (field.type === 'photo') return Array.isArray(value) ? (words.photos ? words.photos(value.length) : String(value.length)) : ''
  return typeof value === 'string' ? value : ''
}

/** A PNG as a data URL's base64 part, or null when it is not one. */
export function signatureBase64(dataUrl: unknown): string | null {
  if (typeof dataUrl !== 'string') return null
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match || match[1].length > SIGNATURE_MAX_BASE64 || match[1].length < 100) return null
  return match[1]
}

/**
 * The acceptance protocol every installation starts with — the form a painter
 * needs first. A template like any other afterwards: the office renames,
 * extends or switches it off.
 */
export const ACCEPTANCE_PROTOCOL: { name: string; description: string; fields: FormField[]; signers: string[] } = {
  name: 'Abnahmeprotokoll',
  description: 'Abnahme der ausgeführten Arbeiten mit Unterschrift von Auftraggeber und Auftragnehmer.',
  fields: [
    { id: 'h_project', type: 'heading', label: 'Bauvorhaben' },
    { id: 'project_number', type: 'text', label: 'Projektnummer', prefill: 'projectNumber' },
    { id: 'project_name', type: 'text', label: 'Bauvorhaben', prefill: 'projectName', required: true },
    { id: 'customer', type: 'text', label: 'Auftraggeber', prefill: 'customerName', required: true },
    { id: 'site', type: 'text', label: 'Baustelle', prefill: 'siteAddress' },
    { id: 'contractor', type: 'text', label: 'Auftragnehmer', prefill: 'companyName' },
    { id: 'manager', type: 'text', label: 'Bauleitung', prefill: 'manager' },
    { id: 'h_work', type: 'heading', label: 'Leistung' },
    { id: 'work', type: 'longtext', label: 'Ausgeführte Leistungen', prefill: 'workTypes' },
    { id: 'date', type: 'date', label: 'Datum der Abnahme', prefill: 'today', required: true },
    { id: 'h_result', type: 'heading', label: 'Abnahme' },
    {
      id: 'result',
      type: 'choice',
      label: 'Ergebnis',
      required: true,
      options: ['Abnahme ohne Mängel', 'Abnahme mit Mängeln (siehe unten)', 'Abnahme verweigert'],
    },
    { id: 'defects', type: 'longtext', label: 'Festgestellte Mängel', prefill: 'openDefects' },
    { id: 'deadline', type: 'date', label: 'Frist zur Mängelbeseitigung' },
    { id: 'remarks', type: 'longtext', label: 'Bemerkungen' },
    { id: 'handover', type: 'checkbox', label: 'Die Baustelle wurde besenrein übergeben.' },
  ],
  signers: ['Auftraggeber', 'Auftragnehmer'],
}
