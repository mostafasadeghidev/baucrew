// Pure mapping logic for the Excel/CSV import — unit-tested, no server import.

/** Target fields a spreadsheet column can be mapped onto. */
export const IMPORT_FIELDS = [
  'name',
  'customerName',
  'street',
  'postalCode',
  'city',
  'price',
  'plannedStart',
  'plannedEnd',
  'description',
  'externalId',
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]

/** header text (as in the file) per target field; missing = not imported. */
export type ImportMapping = Partial<Record<ImportField, string>>

export type ImportProfile = { name: string; mapping: ImportMapping }

/** "50.000,00 €", "50000", 50000 → 50000. Garbage → null. */
export function normalizePrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^\d,.-]/g, '')
  if (!cleaned) return null
  // German format: dots group thousands, the comma is the decimal separator.
  const normalized =
    cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Date cell, ISO string or German dd.mm.yyyy → UTC midnight. */
export function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))
  }
  if (typeof value !== 'string') return null
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
  const de = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (de) {
    const year = de[3].length === 2 ? 2000 + Number(de[3]) : Number(de[3])
    const d = new Date(Date.UTC(year, Number(de[2]) - 1, Number(de[1])))
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

export type DraftFields = {
  name: string
  customerName: string | null
  street: string | null
  postalCode: string | null
  city: string | null
  price: number | null
  plannedStart: Date | null
  plannedEnd: Date | null
  description: string | null
  externalId: string | null
}

const text = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
  return s ? s.slice(0, 300) : null
}

/** One spreadsheet row → draft fields. Null when no usable name. */
export function mapRow(
  headers: string[],
  row: unknown[],
  mapping: ImportMapping
): DraftFields | null {
  const cell = (field: ImportField): unknown => {
    const header = mapping[field]
    if (!header) return null
    const idx = headers.indexOf(header)
    return idx === -1 ? null : row[idx]
  }
  const name = text(cell('name'))
  if (!name) return null
  return {
    name,
    customerName: text(cell('customerName')),
    street: text(cell('street')),
    postalCode: text(cell('postalCode')),
    city: text(cell('city')),
    price: normalizePrice(cell('price')),
    plannedStart: normalizeDate(cell('plannedStart')),
    plannedEnd: normalizeDate(cell('plannedEnd')),
    description: text(cell('description')),
    externalId: text(cell('externalId')),
  }
}
