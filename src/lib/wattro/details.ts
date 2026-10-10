/**
 * What Wattro knows about a machine beyond the four fields it owns — where
 * it is right now, who it belongs to, brand and model, when and how it was
 * last scanned, its GPS position, its tags — in the shape this app stores on
 * the device (`Device.externalData`) and shows on the Devices page.
 *
 * Pure: the sync builds it from an asset plus Wattro's employee and project
 * lists (names instead of bare ids, resolved once per run), the pages read it
 * back. Nothing here is edited in this app; the next sync replaces it whole.
 */
import { z } from 'zod'
import type { WattroAsset } from './assets'

export type WattroWhereKind = 'employee' | 'project' | 'store'

export type WattroWhere = {
  kind: WattroWhereKind
  id: number
  /** Null when Wattro's lists did not name the id (deleted since, say). */
  name: string | null
  /** A project's number in Wattro ("P12"). */
  projectNo: string | null
  /** A project's site address. */
  address: string | null
  /** A project Wattro already marks finished — a machine still there was likely forgotten. */
  finished: boolean
  /** When the machine was assigned there (Wattro's last_assign_ts). */
  since: string | null
}

export type WattroDetails = {
  v: 1
  wattroId: number
  where: WattroWhere | null
  homeEmployee: string | null
  homeStore: string | null
  brand: string | null
  model: string | null
  serialNumber: string | null
  notes: string | null
  price: string | null
  purchasedAt: string | null
  tags: string[]
  inspectionAt: string | null
  reservationEndAt: string | null
  lastSeen: {
    at: string
    trigger: string | null
    byEmployee: string | null
    byTerminal: number | null
  } | null
  position: { at: string | null; lat: number; lng: number } | null
  gps: boolean
  nameplateImage: string | null
  createdAt: string | null
  updatedAt: string
}

/** Wattro's people and sites by id, read once per run. */
export type WattroLookups = {
  employees: Map<number, string>
  projects: Map<number, { name: string; projectNo: string | null; address: string | null; finished: boolean }>
  stores: Map<number, string>
}

export function emptyLookups(): WattroLookups {
  return { employees: new Map(), projects: new Map(), stores: new Map() }
}

/**
 * Stores have no list of their own in Wattro's API; their names come inline,
 * as the home store of the machines that belong there.
 */
export function storesFromAssets(assets: WattroAsset[]): Map<number, string> {
  const stores = new Map<number, string>()
  for (const asset of assets) {
    const home = asset.extra?.homeStore
    if (home) stores.set(home.id, home.name)
  }
  return stores
}

const KINDS: Record<string, WattroWhereKind> = {
  Employee: 'employee',
  Project: 'project',
  Store: 'store',
}

function clean(s: string | null | undefined): string | null {
  const t = s?.trim()
  return t ? t : null
}

function coordinate(raw: string | null, limit: number): number | null {
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null
}

/** Only a web address is kept — nothing that would run or reach elsewhere from an <a href>. */
function httpsUrl(raw: string | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function buildWattroDetails(asset: WattroAsset, lookups: WattroLookups): WattroDetails {
  const x = asset.extra
  const assignment = asset.currentAssignment
  const kind = assignment ? KINDS[assignment.assigneeType] : undefined

  let where: WattroWhere | null = null
  if (assignment && kind) {
    const project = kind === 'project' ? lookups.projects.get(assignment.assigneeId) : undefined
    where = {
      kind,
      id: assignment.assigneeId,
      name:
        kind === 'employee'
          ? (lookups.employees.get(assignment.assigneeId) ?? null)
          : kind === 'store'
            ? (lookups.stores.get(assignment.assigneeId) ?? null)
            : (project?.name ?? null),
      projectNo: project?.projectNo ?? null,
      address: project?.address ?? null,
      finished: project?.finished ?? false,
      since: x?.lastAssignAt ?? null,
    }
  }

  const lat = coordinate(x?.latitude ?? null, 90)
  const lng = coordinate(x?.longitude ?? null, 180)

  return {
    v: 1,
    wattroId: asset.id,
    where,
    homeEmployee: clean(x?.homeEmployee?.name),
    homeStore: clean(x?.homeStore?.name),
    brand: clean(x?.brand),
    model: clean(x?.model),
    serialNumber: clean(x?.serialNumber),
    notes: clean(x?.notes),
    price: clean(x?.price),
    purchasedAt: x?.purchasedAt ?? null,
    tags: [...new Set((x?.tags ?? []).map((t) => t.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')),
    inspectionAt: x?.inspectionAt ?? null,
    reservationEndAt: x?.reservationEndAt ?? null,
    lastSeen: x?.lastSeenAt
      ? {
          at: x.lastSeenAt,
          trigger: clean(x.lastSeenTrigger),
          byEmployee:
            x.lastSeenByEmployeeId !== null ? (lookups.employees.get(x.lastSeenByEmployeeId) ?? null) : null,
          byTerminal: x.lastSeenByTerminalId,
        }
      : null,
    position: lat !== null && lng !== null && !(lat === 0 && lng === 0) ? { at: x?.positionAt ?? null, lat, lng } : null,
    gps: x?.gpsMode === 'ENABLED',
    nameplateImage: httpsUrl(x?.nameplateImage ?? null),
    createdAt: x?.createdAt ?? null,
    updatedAt: asset.updatedAt,
  }
}

// Reading it back: the column is JSON, so it is checked, not trusted — a
// shape from an older version reads as "nothing known" rather than a crash.
const s = z.string().nullable()
const detailsSchema = z.object({
  v: z.literal(1),
  wattroId: z.number(),
  where: z
    .object({
      kind: z.enum(['employee', 'project', 'store']),
      id: z.number(),
      name: s,
      projectNo: s,
      address: s,
      finished: z.boolean(),
      since: s,
    })
    .nullable(),
  homeEmployee: s,
  homeStore: s,
  brand: s,
  model: s,
  serialNumber: s,
  notes: s,
  price: s,
  purchasedAt: s,
  tags: z.array(z.string()),
  inspectionAt: s,
  reservationEndAt: s,
  lastSeen: z
    .object({ at: z.string(), trigger: s, byEmployee: s, byTerminal: z.number().nullable() })
    .nullable(),
  position: z.object({ at: s, lat: z.number(), lng: z.number() }).nullable(),
  gps: z.boolean(),
  nameplateImage: s,
  createdAt: s,
  updatedAt: z.string(),
})

export function readWattroDetails(raw: unknown): WattroDetails | null {
  const parsed = detailsSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * Equal as JSON, whatever the key order — Postgres' jsonb hands keys back
 * sorted its own way, so a plain stringify would call every row changed.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b)
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** The Devices page's tabs: where a machine is, at a glance. */
export type DeviceWhereFilter = 'all' | 'store' | 'employee' | 'project'

export function parseWhereFilter(raw: string | undefined): DeviceWhereFilter {
  return raw === 'store' || raw === 'employee' || raw === 'project' ? raw : 'all'
}

/**
 * Which tab a device falls under. Wattro's word counts for a machine Wattro
 * tracks; a device of this app's own is out when it has an open hand-out
 * (with a person or on a project) and in the store otherwise.
 */
export function whereKindOf(
  details: WattroDetails | null,
  handout: { project: unknown | null; employee: unknown | null } | null
): Exclude<DeviceWhereFilter, 'all'> {
  if (handout?.project) return 'project'
  if (handout?.employee) return 'employee'
  if (details?.where) return details.where.kind
  return 'store'
}

/** Wattro's last-seen triggers, as the page names them. */
export const LAST_SEEN_TRIGGERS = ['SCAN_EPC', 'SCAN_CODE', 'GPS_LOCATION_RECEIVED', 'MANUAL'] as const

/** An OpenStreetMap link for a position: a map anyone can open, no key, no tracking script. */
export function mapUrl(position: { lat: number; lng: number }): string {
  const lat = position.lat.toFixed(6)
  const lng = position.lng.toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
}

/** What the page calls a place it cannot name. */
export type WhereLabels = {
  unknownEmployee: (id: number) => string
  unknownProject: (id: number) => string
  unknownStore: (id: number) => string
}

/** The place's name — a site with its Wattro number in front. */
export function whereName(where: WattroWhere, labels: WhereLabels): string {
  if (where.kind === 'project') {
    const name = where.name ?? labels.unknownProject(where.id)
    return where.projectNo ? `${where.projectNo} · ${name}` : name
  }
  if (where.kind === 'employee') return where.name ?? labels.unknownEmployee(where.id)
  return where.name ?? labels.unknownStore(where.id)
}

/** One device on the board, already told which place it stands in. */
export type HolderEntry<T> = {
  item: T
  kind: WattroWhereKind
  /** One column per place: `employee:7`, `project:70`, `store:1` … */
  key: string
  label: string
  /** A site's address, a store's nothing. */
  sub: string | null
  finished: boolean
  name: string
  since: string | null
}

export type HolderColumn<T> = {
  key: string
  kind: WattroWhereKind
  label: string
  sub: string | null
  finished: boolean
  items: T[]
}

const KIND_ORDER: Record<WattroWhereKind, number> = { store: 0, employee: 1, project: 2 }
const byText = (a: string, b: string) => a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' })

/**
 * The board: one list per place — the stores first, then every person, then
 * every site, each in name order (a site's number sorts as a number, P9
 * before P10). Inside a store the machines stand by name; with a person or
 * on a site the one there longest comes first — the one most likely
 * forgotten.
 */
export function groupByHolder<T>(entries: HolderEntry<T>[]): HolderColumn<T>[] {
  const columns = new Map<string, HolderColumn<T> & { entries: HolderEntry<T>[] }>()
  for (const entry of entries) {
    let column = columns.get(entry.key)
    if (!column) {
      column = { key: entry.key, kind: entry.kind, label: entry.label, sub: entry.sub, finished: entry.finished, items: [], entries: [] }
      columns.set(entry.key, column)
    }
    column.entries.push(entry)
  }
  const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY)
  return [...columns.values()]
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || byText(a.label, b.label))
    .map(({ entries: list, ...column }) => ({
      ...column,
      items: [...list]
        .sort((a, b) =>
          column.kind === 'store' ? byText(a.name, b.name) : time(a.since) - time(b.since) || byText(a.name, b.name)
        )
        .map((e) => e.item),
    }))
}

/** One device with a position, ready to be pinned. */
export type PositionEntry<T> = {
  item: T
  lat: number
  lng: number
  kind: WattroWhereKind
  /** The place the device is assigned to — the pin is named after the most common one. */
  label: string
}

export type PositionCluster<T> = {
  /** Stable for a spot: its rounded coordinates. */
  key: string
  /** 1, 2, 3 … — the biggest spot first; the number on the pin and in the list. */
  index: number
  lat: number
  lng: number
  kind: WattroWhereKind
  label: string
  items: T[]
}

/**
 * Three decimals: about a hundred metres here (less east–west) — one yard,
 * one site. Four split the store's yard into five pins, one per corner the
 * scans were made in.
 */
const SPOT_DECIMALS = 3

/**
 * One pin per spot, not per machine. Most machines are last seen where they
 * were scanned — the store's terminal, a foreman's phone on site — so a
 * couple of hundred share a handful of spots; a pin each would be one
 * unreadable stack. A spot is named after the place most of its machines are
 * assigned to and coloured by that kind; the biggest spot comes first.
 */
export function clusterByPosition<T>(entries: PositionEntry<T>[]): PositionCluster<T>[] {
  const spots = new Map<string, PositionEntry<T>[]>()
  for (const entry of entries) {
    const key = `${entry.lat.toFixed(SPOT_DECIMALS)},${entry.lng.toFixed(SPOT_DECIMALS)}`
    const list = spots.get(key)
    if (list) list.push(entry)
    else spots.set(key, [entry])
  }
  const most = <K extends string>(values: K[]): K => {
    const counts = new Map<K, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  return [...spots.entries()]
    .map(([key, list]) => ({
      key,
      lat: list.reduce((sum, e) => sum + e.lat, 0) / list.length,
      lng: list.reduce((sum, e) => sum + e.lng, 0) / list.length,
      kind: most(list.map((e) => e.kind)),
      label: most(list.map((e) => e.label)),
      items: list.map((e) => e.item),
    }))
    .sort((a, b) => b.items.length - a.items.length || byText(a.label, b.label))
    .map((cluster, i) => ({ ...cluster, index: i + 1 }))
}
