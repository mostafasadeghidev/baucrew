/**
 * Configurable option lists (client type, building type, item kind).
 * Stored as JSON in AppSetting; the built-in entries stay as fallback so
 * existing records keep their labels. Pure — DB access in `option-lists-db.ts`.
 */

export type OptionList = 'clientTypes' | 'buildingTypes' | 'itemKinds'

export type OptionEntry = {
  /** Stored in the database — never changes when the label is edited. */
  value: string
  labelDe: string
  labelEn: string
}

/** Built-in entries; they can be renamed but not removed (data may use them). */
export const BUILT_IN: Record<OptionList, OptionEntry[]> = {
  clientTypes: [
    { value: 'PRIVAT', labelDe: 'Privat', labelEn: 'Private' },
    { value: 'GEWERBLICH', labelDe: 'Gewerblich', labelEn: 'Commercial' },
  ],
  buildingTypes: [
    { value: 'NEUBAU', labelDe: 'Neubau', labelEn: 'New build' },
    { value: 'ALTBAU_SANIERUNG', labelDe: 'Altbau / Sanierung', labelEn: 'Old building / renovation' },
  ],
  itemKinds: [
    { value: 'TOOL', labelDe: 'Werkzeug', labelEn: 'Tool' },
    { value: 'MATERIAL', labelDe: 'Material', labelEn: 'Material' },
  ],
}

/** Suggested extras the owner asked for — offered as "add" buttons in Settings. */
export const SUGGESTED: Record<OptionList, OptionEntry[]> = {
  clientTypes: [{ value: 'OEFFENTLICH', labelDe: 'Öffentlich', labelEn: 'Public sector' }],
  buildingTypes: [
    { value: 'SANIERUNG', labelDe: 'Sanierung', labelEn: 'Renovation' },
    { value: 'BRUECKE', labelDe: 'Brücke', labelEn: 'Bridge' },
    { value: 'STRASSE', labelDe: 'Straße', labelEn: 'Road' },
  ],
  itemKinds: [
    { value: 'WARNSCHILD', labelDe: 'Warnschild', labelEn: 'Warning sign' },
    { value: 'ABSPERRBAND', labelDe: 'Absperrband', labelEn: 'Barrier tape' },
  ],
}

/** Slug used as the stored value of a newly created entry. */
export function slugify(label: string): string {
  const map: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }
  return (
    label
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => map[c] ?? c)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase()
      .slice(0, 40) || 'OPTION'
  )
}

function isEntry(v: unknown): v is OptionEntry {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.value === 'string' && typeof o.labelDe === 'string' && typeof o.labelEn === 'string'
}

/** Parses the stored JSON; built-in entries are always present (never lost). */
export function parseOptionList(list: OptionList, raw: string | null | undefined): OptionEntry[] {
  let stored: OptionEntry[] = []
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) stored = parsed.filter(isEntry)
    } catch {
      stored = []
    }
  }
  if (stored.length === 0) return BUILT_IN[list].map((e) => ({ ...e }))
  // Built-ins that were dropped from the stored list are appended back, so a
  // project/item that still uses them keeps a readable label.
  const seen = new Set(stored.map((e) => e.value))
  return [...stored, ...BUILT_IN[list].filter((e) => !seen.has(e.value))]
}

export function serializeOptionList(entries: OptionEntry[]): string {
  return JSON.stringify(entries)
}

/** Label in the active locale, falling back to the stored value. */
export function optionLabel(entries: OptionEntry[], value: string | null | undefined, locale: string): string {
  if (!value) return ''
  const hit = entries.find((e) => e.value === value)
  if (!hit) return value
  return locale === 'en' ? hit.labelEn : hit.labelDe
}

/** Reads the settings form (`value_<VALUE>` / `labelDe_<VALUE>` / `labelEn_<VALUE>` plus new rows). */
export function optionListFromForm(getAll: (name: string) => string[]): OptionEntry[] {
  const values = getAll('value')
  const de = getAll('labelDe')
  const en = getAll('labelEn')
  const out: OptionEntry[] = []
  for (let i = 0; i < values.length; i++) {
    const labelDe = (de[i] ?? '').trim()
    if (!labelDe) continue
    const labelEn = (en[i] ?? '').trim() || labelDe
    const value = (values[i] ?? '').trim() || slugify(labelDe)
    if (out.some((e) => e.value === value)) continue
    out.push({ value, labelDe: labelDe.slice(0, 60), labelEn: labelEn.slice(0, 60) })
  }
  return out
}
