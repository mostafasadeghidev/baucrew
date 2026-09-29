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

export const FIELD_TYPES = ['heading', 'text', 'longtext', 'number', 'date', 'checkbox', 'choice', 'multi', 'table', 'photo'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

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
] as const
export type PrefillSource = (typeof PREFILL_SOURCES)[number]

export type FormField = {
  id: string
  type: FieldType
  label: string
  required?: boolean
  /** The answers of a `choice` or a `multi`; the columns of a `table`. */
  options?: string[]
  prefill?: PrefillSource
}

/**
 * What a field holds: a text for most, true or false for a checkbox, the
 * chosen answers of a `multi` and the photos' document ids of a `photo` as a
 * list, the rows of a `table` as a list of lists (one text per column).
 */
export type FormValue = string | boolean | string[] | string[][]
export type FormValues = Record<string, FormValue>

export const FORM_NAME_MAX = 200
export const FIELD_LABEL_MAX = 200
export const FIELD_TEXT_MAX = 300
export const FIELD_LONGTEXT_MAX = 5000
export const MAX_FIELDS = 80
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
const PREFILLABLE: ReadonlySet<FieldType> = new Set(['text', 'longtext', 'date', 'choice'])
/** The types that carry answers or columns. */
const WITH_OPTIONS: ReadonlySet<FieldType> = new Set(['choice', 'multi', 'table'])

const isType = (v: unknown): v is FieldType => (FIELD_TYPES as readonly unknown[]).includes(v)
const isPrefill = (v: unknown): v is PrefillSource => (PREFILL_SOURCES as readonly unknown[]).includes(v)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

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
    const label = text(source.label, FIELD_LABEL_MAX)
    if (!isType(source.type) || !label) continue
    let id = typeof source.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(source.id) ? source.id : ''
    if (!id || taken.has(id)) {
      let n = fields.length + 1
      while (taken.has(`f${n}`)) n++
      id = `f${n}`
    }
    taken.add(id)
    const field: FormField = { id, type: source.type, label }
    if (source.type !== 'heading') {
      if (source.required === true) field.required = true
      if (isPrefill(source.prefill) && PREFILLABLE.has(source.type)) field.prefill = source.prefill
    }
    if (WITH_OPTIONS.has(source.type)) {
      const max = source.type === 'table' ? MAX_COLUMNS : MAX_OPTIONS
      const options = Array.isArray(source.options)
        ? [...new Set(source.options.map((o) => text(o, FIELD_TEXT_MAX)).filter(Boolean))].slice(0, max)
        : []
      if (options.length === 0) continue
      field.options = options
    }
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

/** What an untouched field holds. */
export function emptyValue(type: FieldType): FormValue {
  if (type === 'checkbox') return false
  if (type === 'multi' || type === 'photo' || type === 'table') return []
  return ''
}

/** The values a new form starts with. */
export function prefillValues(fields: FormField[], context: PrefillContext): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    if (field.type === 'heading') continue
    values[field.id] = field.prefill ? (context[field.prefill] ?? '') : emptyValue(field.type)
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
    if (field.type === 'heading') continue
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
      values[field.id] = text(value, field.type === 'longtext' ? FIELD_LONGTEXT_MAX : FIELD_TEXT_MAX)
    }
  }
  return values
}

/** Whether a field holds nothing yet. */
export function isEmptyValue(value: FormValue | undefined): boolean {
  if (value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  return value === false || value === ''
}

/** The required fields that are still empty — a checkbox that must be ticked counts. */
export function missingRequired(fields: FormField[], values: FormValues): FormField[] {
  return fields.filter((field) => field.required && field.type !== 'heading' && isEmptyValue(values[field.id]))
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
    fields: fields.map((f) => [f.id, f.type, f.label, f.type === 'heading' ? null : (values[f.id] ?? emptyValue(f.type))]),
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
