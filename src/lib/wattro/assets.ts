/**
 * Wattro's machines ("assets") read into this app's devices. This file is
 * pure: the HTTP talk lives in ./client, the database writes in ./sync — so
 * the mapping and every match decision can be tested without either.
 *
 * What Wattro is: the customer's tool-tracking system. It knows machines,
 * where they belong (Lager), who they are handed to, and where they are used.
 * We read that once into the Devices page, which stays the office's own list.
 */

/** The externalSystem mark a synced device carries. */
export const WATTRO_SYSTEM = 'wattro'

/** Wattro's list default and our page size: 100 assets per request. */
export const ASSET_PAGE_SIZE = 100

/** One asset as Wattro's GET /api/v1/asset/ returns it — only what we read. */
export type WattroAsset = {
  /** Wattro's own number for the machine; the stable link between the systems. */
  id: number
  name: string
  /** The inventory number people read — Wattro calls it the "human id". */
  humanId: string | null
  storageLocation: string | null
  active: boolean
  updatedAt: string
  /**
   * Where Wattro says the machine is right now — bare references; Wattro's
   * spec names the types Employee, Project and Store. Shown on the Devices
   * page (./details), never written to this app's own hand-outs.
   */
  currentAssignment: { assigneeId: number; assigneeType: string } | null
  /** Everything else Wattro tells about the machine; shown, never owned. */
  extra?: WattroAssetExtra
}

/** A person or place Wattro names inline: its id and its name. */
export type WattroRef = { id: number; name: string }

/** The rest of Wattro's asset record, as it comes (dates as ISO strings). */
export type WattroAssetExtra = {
  createdAt: string | null
  brand: string | null
  model: string | null
  serialNumber: string | null
  notes: string | null
  /** Decimal as Wattro sends it ("1234.50") — financial, shown only to who may see prices. */
  price: string | null
  /** A calendar day, "2024-05-17". */
  purchasedAt: string | null
  tags: string[]
  homeEmployee: WattroRef | null
  homeStore: WattroRef | null
  lastAssignAt: string | null
  inspectionAt: string | null
  reservationEndAt: string | null
  nameplateImage: string | null
  lastSeenAt: string | null
  /** How it was last seen: SCAN_EPC (RFID chip), SCAN_CODE, GPS_LOCATION_RECEIVED, MANUAL … */
  lastSeenTrigger: string | null
  lastSeenByEmployeeId: number | null
  lastSeenByTerminalId: number | null
  positionAt: string | null
  /** Decimal strings, as Wattro sends them. */
  latitude: string | null
  longitude: string | null
  /** NO_GPS or ENABLED. */
  gpsMode: string | null
}

/** One page of Wattro's list: the usable assets plus what had to be skipped. */
export type AssetPage = {
  items: WattroAsset[]
  /** Records that came back incomplete; counted, never written. */
  invalid: number
  /** Wattro's total for this filter, from the response's `count`. */
  count: number
}

export type FetchAssetPage = (params: {
  active: boolean
  offset: number
  limit: number
}) => Promise<AssetPage>

/**
 * The device fields Wattro owns once a row is imported: name, inventory
 * number, storage location, active. Everything else on a device — category,
 * notes, video link, the handouts — stays this app's own.
 */
export type WattroDeviceInfo = {
  name: string
  inventoryNo: string | null
  storageLocation: string | null
  active: boolean
}

export function mapAssetToDeviceInfo(asset: WattroAsset): WattroDeviceInfo {
  const trim = (s: string | null): string | null => {
    const t = s?.trim()
    return t ? t : null
  }
  return {
    name: asset.name.trim(),
    inventoryNo: trim(asset.humanId),
    storageLocation: trim(asset.storageLocation),
    active: asset.active,
  }
}

/** A device row as the sync needs to see it: identity plus the mappable fields. */
export type LocalDeviceRow = {
  id: string
  name: string
  inventoryNo: string | null
  storageLocation: string | null
  active: boolean
  externalSystem: string | null
  externalId: string | null
}

export type SyncConflictReason =
  /** The inventory number is on another row Wattro does not own (or another import already took it). */
  | 'inventoryTaken'
  /** The inventory number is on several free rows, or on several Wattro assets — choosing would be a guess. */
  | 'inventoryAmbiguous'

export type SyncConflict = {
  externalId: string
  name: string
  inventoryNo: string | null
  reason: SyncConflictReason
}

export type SyncPlanEntry = {
  deviceId: string
  /** The Wattro asset's id as a string — the identity an adopted row is stamped with. */
  externalId: string
  fields: WattroDeviceInfo
  /** True when the row was claimed for Wattro this run (matched by inventory number). */
  adopted: boolean
}

export type SyncPlan = {
  updates: SyncPlanEntry[]
  creates: Array<{ externalId: string; fields: WattroDeviceInfo }>
  conflicts: SyncConflict[]
}

/** Inventory numbers are typed by hand, so the match forgives case and spaces. */
function normalizeInventoryNo(no: string | null): string | null {
  const t = no?.trim().toLowerCase()
  return t ? t : null
}

/**
 * One asset per Wattro id. The active and the inactive list are read one
 * after the other, so a machine switched off in between arrives twice; it is
 * the same machine, and its newest record is the truth (on a tie, the later
 * one — the inactive list is read second).
 */
export function newestPerId(assets: WattroAsset[]): WattroAsset[] {
  const byId = new Map<number, WattroAsset>()
  for (const asset of assets) {
    const seen = byId.get(asset.id)
    if (!seen || Date.parse(asset.updatedAt) >= Date.parse(seen.updatedAt) || Number.isNaN(Date.parse(seen.updatedAt))) {
      byId.set(asset.id, asset)
    }
  }
  return [...byId.values()]
}

/**
 * Decides, for every Wattro asset, what happens to which local device.
 *
 * A row Wattro already owns (externalSystem "wattro") is found by its stored
 * external id and refreshed — that is the rule every later run takes. A row
 * nobody owns is adopted when its inventory number matches the asset's, when
 * exactly one free row wears it and exactly one unlinked Wattro asset does;
 * more candidates on either side would make the choice a guess, so it is
 * reported instead. An asset Wattro sends twice (read once active, once
 * inactive) counts once, by its newest record. A name alone never matches: two machines
 * may honestly carry the same name, and a merge on it would be silent data
 * loss. Everything else is created as a new device of its own.
 */
export function planAssetSync(assets: WattroAsset[], local: LocalDeviceRow[]): SyncPlan {
  const byExternalId = new Map<string, LocalDeviceRow>()
  const byInventoryNo = new Map<string, LocalDeviceRow[]>()
  for (const row of local) {
    if (row.externalSystem === WATTRO_SYSTEM && row.externalId) {
      byExternalId.set(row.externalId, row)
    }
    const no = normalizeInventoryNo(row.inventoryNo)
    if (no) {
      const list = byInventoryNo.get(no)
      if (list) list.push(row)
      else byInventoryNo.set(no, [row])
    }
  }

  const plan: SyncPlan = { updates: [], creates: [], conflicts: [] }
  const incoming = newestPerId(assets)

  // How many not-yet-linked Wattro assets wear each inventory number. Two of
  // them on one free local row would make adoption a guess, whichever came
  // first in the list.
  const unlinkedPerNo = new Map<string, number>()
  for (const asset of incoming) {
    if (byExternalId.has(String(asset.id))) continue
    const no = normalizeInventoryNo(mapAssetToDeviceInfo(asset).inventoryNo)
    if (no) unlinkedPerNo.set(no, (unlinkedPerNo.get(no) ?? 0) + 1)
  }

  for (const asset of incoming) {
    const fields = mapAssetToDeviceInfo(asset)
    const externalId = String(asset.id)

    const owned = byExternalId.get(externalId)
    if (owned) {
      plan.updates.push({ deviceId: owned.id, externalId, fields, adopted: false })
      continue
    }

    const no = normalizeInventoryNo(fields.inventoryNo)
    const candidates = no ? (byInventoryNo.get(no) ?? []) : []
    const free = candidates.filter((row) => row.externalSystem === null)

    if (free.length === 1 && no && unlinkedPerNo.get(no) === 1) {
      plan.updates.push({ deviceId: free[0].id, externalId, fields, adopted: true })
      continue
    }
    if (free.length > 0) {
      // Several free rows wear the number, or Wattro wears it on several
      // machines: which row is which machine, a person decides.
      plan.conflicts.push({ externalId, name: fields.name, inventoryNo: fields.inventoryNo, reason: 'inventoryAmbiguous' })
      continue
    }
    if (candidates.length > 0) {
      // The number exists, but every row wearing it belongs to Wattro (another
      // id — it was renumbered there) or to another system. Never steal it.
      plan.conflicts.push({ externalId, name: fields.name, inventoryNo: fields.inventoryNo, reason: 'inventoryTaken' })
      continue
    }
    plan.creates.push({ externalId, fields })
  }

  return plan
}

/**
 * What a sync would write onto a device; null when Wattro brings no change,
 * so an idempotent run does not touch a single row.
 */
export function deviceChange(
  fields: WattroDeviceInfo,
  current: Pick<LocalDeviceRow, 'name' | 'inventoryNo' | 'storageLocation' | 'active'>
): WattroDeviceInfo | null {
  const same =
    fields.name === current.name &&
    fields.inventoryNo === current.inventoryNo &&
    fields.storageLocation === current.storageLocation &&
    fields.active === current.active
  return same ? null : fields
}

/**
 * Walks every page one `active` filter allows and stops on Wattro's own
 * count, on a short page, or on an empty one — a runaway loop over a lying
 * count is capped at 200 pages (20 000 assets), far past any tool shed.
 * A failed page throws; the run then records nothing — a partial read is
 * never taken as proof that the missing machines are gone.
 */
export async function collectAssets(
  fetchPage: FetchAssetPage,
  active: boolean,
  maxPages = 200
): Promise<{ items: WattroAsset[]; invalid: number }> {
  const items: WattroAsset[] = []
  let invalid = 0
  let count = Number.POSITIVE_INFINITY

  for (let page = 0; page < maxPages; page++) {
    const offset = page * ASSET_PAGE_SIZE
    const result = await fetchPage({ active, offset, limit: ASSET_PAGE_SIZE })
    count = result.count
    items.push(...result.items)
    invalid += result.invalid
    // A page is short by what Wattro sent, not by what survived validation:
    // one broken record on a full page must not end the walk early.
    const received = result.items.length + result.invalid
    if (received < ASSET_PAGE_SIZE || items.length + invalid >= count) break
  }

  return { items, invalid }
}

/** What one finished sync run reports — stored and shown as it is. */
export type WattroSyncCounts = {
  created: number
  /** Local rows claimed for Wattro by their inventory number. */
  adopted: number
  /** Known rows whose Wattro data changed. */
  updated: number
  /** Known rows Wattro had nothing new for. */
  unchanged: number
  /** Known rows turned inactive because Wattro says so. */
  deactivated: number
  /** Wattro records too incomplete to use. */
  invalid: number
  /** Skipped matches, each with its reason; the stored list is capped at 20. */
  conflictCount: number
  conflicts: SyncConflict[]
  fetchedActive: number
  fetchedInactive: number
}

export type WattroSyncFailure =
  | 'notConfigured'
  /** Wattro answered fine, but writing the devices failed; nothing was kept. */
  | 'database'
  | 'auth'
  /** The machines came, but the employee or project list was refused — the key lacks the right to read them. */
  | 'lookups'
  | 'rateLimit'
  | 'network'
  | 'upstream'
  | 'response'

export type WattroSyncOutcome =
  | { ok: true; counts: WattroSyncCounts }
  | { ok: false; error: WattroSyncFailure; detail?: string }
