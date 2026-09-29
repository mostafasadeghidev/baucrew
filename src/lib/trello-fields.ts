/**
 * The fields a Trello card carries through a custom-fields power-up — customer
 * name, site address, order value, type of work, the customer's wish, the day
 * of the site visit, customer number — read out of the board's JSON export.
 *
 * The power-up keeps its data in Trello's `pluginData`: the board holds the
 * field definitions (`CFG`), each card its values (`FD`), both as JSON
 * compressed with lz-string (`compressToUTF16`) inside a JSON string. A field
 * is known by its name, not its id — a board may define the same field twice
 * (an old and a new set, the cards split between them), and the ids differ
 * from board to board. Where a card has a value in both, the later
 * definition's wins.
 *
 * Pure: the importer reads the result, nothing here touches the database.
 */
import { decompressFromUTF16 } from 'lz-string'

/** A field as the power-up defines it: `T` text, `N` number, `D` date, `L` a list of options. */
export type PowerUpField = { id: string; type: string; name: string; options: Array<{ id: string; text: string }> }

/** What a card's fields say, in the app's terms; a field the card leaves empty is absent. */
export type TrelloCardFields = {
  customerName?: string
  customerNumber?: string
  /** The site's address as one line of text, and as far as it could be split. */
  siteAddress?: { text: string; street: string | null; postalCode: string | null; city: string | null }
  orderValue?: number
  /** The type of work — the options chosen, or the words typed. */
  workTypes?: string[]
  executionWish?: string
  /** "yyyy-mm-dd" */
  inspectionDate?: string
}

type Key = 'customerName' | 'customerNumber' | 'siteAddress' | 'orderValue' | 'workTypes' | 'executionWish' | 'inspectionDate'

/** The field names the office's boards use, folded (lower case, letters only, umlauts undone). */
const NAMES: Record<string, Key> = {
  kundenname: 'customerName',
  kunde: 'customerName',
  kundennummer: 'customerNumber',
  kundennr: 'customerNumber',
  baustellenadresse: 'siteAddress',
  baustelle: 'siteAddress',
  adresse: 'siteAddress',
  auftragswert: 'orderValue',
  artderarbeit: 'workTypes',
  gewerk: 'workTypes',
  gewerke: 'workTypes',
  ausfuhrungswunsch: 'executionWish',
  terminbesichtigung: 'inspectionDate',
  besichtigung: 'inspectionDate',
}

/** "Ausführungswunsch " → "ausfuhrungswunsch" */
export const foldName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The JSON inside a power-up's compressed value, or null for anything that is not one. */
export function unpack(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return null
  try {
    const text = decompressFromUTF16(value)
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

/** A plugin's stored object — Trello keeps it as a JSON string. */
function pluginValue(entry: unknown): Record<string, unknown> | null {
  if (!record(entry) || typeof entry.value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(entry.value)
    return record(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * The power-up's field definitions from the board's `pluginData`, and the
 * plugin's id to find the cards' values by. Null when the board has none.
 */
export function powerUpFields(boardPluginData: unknown): { pluginId: string; fields: PowerUpField[] } | null {
  if (!Array.isArray(boardPluginData)) return null
  for (const entry of boardPluginData) {
    const value = pluginValue(entry)
    const cfg = value ? unpack(value.CFG) : null
    if (!record(cfg) || !Array.isArray(cfg.fields)) continue
    const fields = cfg.fields
      .filter(record)
      .map((f) => ({
        id: String(f.id ?? ''),
        type: String(f.type ?? ''),
        name: String(f.name ?? '').trim(),
        options: Array.isArray(f.options)
          ? f.options.filter(record).map((o) => ({ id: String(o.id ?? ''), text: String(o.text ?? '').trim() })).filter((o) => o.id && o.text)
          : [],
      }))
      .filter((f) => f.id && f.name)
    if (fields.length > 0) return { pluginId: String((entry as Record<string, unknown>).idPlugin ?? ''), fields }
  }
  return null
}

/**
 * A site's address as the office types it into a card, split into street,
 * postal code and town:
 *
 * - "Musterweg 3, 12345 Musterstadt" and "12345 Musterstadt" — with the code;
 * - "Musterweg 3, Musterstadt" — a comma before the town;
 * - "Musterweg 3 Musterstadt" — the town after the house number;
 * - "Musterstadt" — no number at all is a town;
 * - anything else stays whole in the street.
 */
export function splitAddress(text: string): { street: string | null; postalCode: string | null; city: string | null } {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return { street: null, postalCode: null, city: null }
  const withCode = /^(.*?)[,\s]+(\d{5})\s+(.+)$/.exec(clean)
  if (withCode) return { street: withCode[1].replace(/[,\s]+$/, '') || null, postalCode: withCode[2], city: withCode[3].trim() || null }
  const onlyTown = /^(\d{5})\s+(.+)$/.exec(clean)
  if (onlyTown) return { street: null, postalCode: onlyTown[1], city: onlyTown[2] }
  const comma = clean.lastIndexOf(',')
  if (comma > 0) {
    const street = clean.slice(0, comma).trim()
    const city = clean.slice(comma + 1).trim()
    // Only a town after the comma — no digits in it.
    if (street && city && !/\d/.test(city)) return { street, postalCode: null, city }
  }
  const townAfterNumber = /^(.*?\s\d+\s?[a-zA-Z]?(?:\s?-\s?\d+[a-zA-Z]?)?)\s+([^\d,]+)$/.exec(clean)
  if (townAfterNumber) return { street: townAfterNumber[1].trim(), postalCode: null, city: townAfterNumber[2].trim() }
  if (!/\d/.test(clean)) return { street: null, postalCode: null, city: clean }
  return { street: clean, postalCode: null, city: null }
}

/** A power-up date — "2026-03-01T00:00:00.000Z" — as the day it names. */
function day(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match && !Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`)) ? match[1] : undefined
}

/** One card's field values, from its `pluginData`, read against the board's definitions. */
export function cardFields(definitions: { pluginId: string; fields: PowerUpField[] } | null, cardPluginData: unknown): TrelloCardFields {
  const out: TrelloCardFields = {}
  if (!definitions || !Array.isArray(cardPluginData)) return out
  const entry = cardPluginData.find((p) => record(p) && (!definitions.pluginId || p.idPlugin === definitions.pluginId))
  const value = pluginValue(entry)
  const data = value ? unpack(value.FD) : null
  if (!record(data)) return out

  for (const field of definitions.fields) {
    const key = NAMES[foldName(field.name)]
    const raw = data[field.id]
    if (!key || raw === null || raw === undefined) continue
    if (key === 'orderValue') {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(/\./g, '').replace(',', '.')) : NaN
      if (Number.isFinite(n) && n >= 0) out.orderValue = Math.round(n * 100) / 100
    } else if (key === 'inspectionDate') {
      const d = day(raw)
      if (d) out.inspectionDate = d
    } else if (key === 'workTypes') {
      const words = Array.isArray(raw)
        ? raw.map((id) => field.options.find((o) => o.id === id)?.text ?? '').filter(Boolean)
        : typeof raw === 'string'
          ? raw.split(/[,;/+]|\bund\b/).map((w) => w.trim()).filter(Boolean)
          : []
      if (words.length > 0) out.workTypes = words
    } else if (key === 'siteAddress') {
      const text = typeof raw === 'string' ? raw.trim() : ''
      if (text) out.siteAddress = { text, ...splitAddress(text) }
    } else {
      const text = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : ''
      if (!text) continue
      if (key === 'executionWish') out.executionWish = text.slice(0, 200)
      else out[key] = text.slice(0, 200)
    }
  }
  return out
}

/** Whether a card said anything through its fields. */
export const hasFields = (fields: TrelloCardFields) => Object.keys(fields).length > 0

/**
 * The trades a card's type of work names, among the ones the app has — by
 * name, folded; a word the app has no trade for is left over.
 */
export function matchTrades(words: string[], trades: Array<{ id: string; names: string[] }>): { ids: string[]; unknown: string[] } {
  const ids: string[] = []
  const unknown: string[] = []
  for (const word of words) {
    const folded = foldName(word)
    if (!folded) continue
    const hit =
      trades.find((t) => t.names.some((n) => foldName(n) === folded)) ??
      trades.find((t) => t.names.some((n) => {
        const name = foldName(n)
        return name.length >= 4 && folded.length >= 4 && (name.startsWith(folded) || folded.startsWith(name))
      }))
    if (hit) {
      if (!ids.includes(hit.id)) ids.push(hit.id)
    } else unknown.push(word)
  }
  return { ids, unknown }
}
