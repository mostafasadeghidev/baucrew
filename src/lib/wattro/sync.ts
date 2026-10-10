import 'server-only'

import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import {
  collectAssets,
  deviceChange,
  newestPerId,
  planAssetSync,
  WATTRO_SYSTEM,
  type FetchAssetPage,
  type LocalDeviceRow,
  type WattroSyncCounts,
  type WattroSyncOutcome,
} from './assets'
import { fetchAssetPage, fetchEmployees, fetchProjects, isWattroConfigured, WattroApiError } from './client'
import { buildWattroDetails, sameJson, storesFromAssets, type WattroDetails, type WattroLookups } from './details'

/**
 * The devices sync: reads every Wattro asset (active and inactive, so a
 * deactivated machine is not mistaken for a missing one), decides per asset
 * what happens (./assets), writes it in one transaction, and only then
 * records the run as done — a failed run leaves the last successful sync
 * standing and the Devices page keeps showing what it had.
 *
 * Nothing is ever deleted here. A machine that vanished from Wattro stays in
 * the list until a person retires it; the run counts tell the office what to
 * look at. Writes stay read-only towards Wattro — no hand-outs, no returns,
 * no project changes travel the other way in this phase.
 */

const LAST_SYNC_KEY = 'wattro.lastSyncAt'
const LAST_RESULT_KEY = 'wattro.lastSyncResult'
const CONFLICTS_STORED = 20
/** Postgres advisory-lock key that lets only one sync write at a time. */
const SYNC_LOCK_ID = 746_120_010
/**
 * How long one run may hold its transaction, a wait for another run's lock
 * included. Prisma's default is 5 s; the first import writes one row per
 * machine over a network hop to the database, and a few hundred need more.
 */
const TX_TIMEOUT_MS = 120_000

/** The last successful run, for the Devices page's "when was this read?" line. */
export async function getLastSync(): Promise<{ at: Date | null; counts: WattroSyncCounts | null }> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: [LAST_SYNC_KEY, LAST_RESULT_KEY] } },
  })
  const at = rows.find((r) => r.key === LAST_SYNC_KEY)
  const result = rows.find((r) => r.key === LAST_RESULT_KEY)
  let counts: WattroSyncCounts | null = null
  if (result) {
    try {
      counts = JSON.parse(result.value) as WattroSyncCounts
    } catch {
      counts = null
    }
  }
  return { at: at ? new Date(at.value) : null, counts }
}

/** Where a run reads from. Injectable so tests feed fixtures instead of talking to Wattro. */
export type WattroSource = {
  fetchPage: FetchAssetPage
  fetchEmployees: () => Promise<WattroLookups['employees']>
  fetchProjects: () => Promise<WattroLookups['projects']>
}

const LIVE: WattroSource = { fetchPage: fetchAssetPage, fetchEmployees, fetchProjects }

/** Runs one sync; production calls always use the real client. */
export async function syncWattroDevices(source: WattroSource = LIVE): Promise<WattroSyncOutcome> {
  if (!isWattroConfigured()) {
    return { ok: false, error: 'notConfigured' }
  }

  let activeRun: Awaited<ReturnType<typeof collectAssets>>
  let inactiveRun: Awaited<ReturnType<typeof collectAssets>>
  let lookups: WattroLookups
  try {
    activeRun = await collectAssets((p) => source.fetchPage({ ...p, active: true }), true)
    inactiveRun = await collectAssets((p) => source.fetchPage({ ...p, active: false }), false)
  } catch (e) {
    if (e instanceof WattroApiError) {
      return { ok: false, error: e.kind, detail: e.message }
    }
    return { ok: false, error: 'network', detail: e instanceof Error ? e.message : 'unknown error' }
  }
  try {
    // Names for the bare ids a machine carries: who holds it, which site.
    // Without them nothing is written: a run that stored the machines with
    // their names blanked would be a loss, not a sync. A key that may read
    // the machines but not these lists is told apart from a key refused.
    const [employees, projects] = await Promise.all([source.fetchEmployees(), source.fetchProjects()])
    lookups = { employees, projects, stores: new Map() }
  } catch (e) {
    if (e instanceof WattroApiError && e.kind === 'auth') {
      return { ok: false, error: 'lookups', detail: e.message }
    }
    if (e instanceof WattroApiError) {
      return { ok: false, error: e.kind, detail: e.message }
    }
    return { ok: false, error: 'network', detail: e instanceof Error ? e.message : 'unknown error' }
  }

  const assets = newestPerId([...activeRun.items, ...inactiveRun.items])
  lookups.stores = storesFromAssets(assets)
  const detailsById = new Map<string, WattroDetails>(
    assets.map((asset) => [String(asset.id), buildWattroDetails(asset, lookups)])
  )

  let counts: WattroSyncCounts
  try {
    counts = await db.$transaction(
      async (tx) => {
        // Two office users clicking at once: the second run waits here for the
        // first to finish, then reads its writes — instead of planning the
        // same creates twice and tripping over the unique (system, id) pair.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_LOCK_ID})`

        const local: Array<LocalDeviceRow & { externalData: unknown }> = await tx.device.findMany({
          select: {
            id: true,
            name: true,
            inventoryNo: true,
            storageLocation: true,
            active: true,
            externalSystem: true,
            externalId: true,
            externalData: true,
          },
        })

        const plan = planAssetSync(assets, local)
        const byId = new Map(local.map((row) => [row.id, row]))

        let adopted = 0
        let updated = 0
        let unchanged = 0
        let deactivated = 0

        for (const entry of plan.updates) {
          const current = byId.get(entry.deviceId)
          if (!current) continue
          const change = deviceChange(entry.fields, current)
          const details = detailsById.get(entry.externalId) ?? null
          const detailsChanged = details !== null && !sameJson(details, current.externalData)
          if (!change && !detailsChanged && !entry.adopted) {
            unchanged++
            continue
          }
          await tx.device.update({
            where: { id: entry.deviceId },
            data: {
              ...(change ?? {}),
              ...(detailsChanged ? { externalData: details as unknown as Prisma.InputJsonObject } : {}),
              // An adopted row carries Wattro's identity from now on — stamped
              // even when Wattro brought no field changes, so every later run
              // finds it by id instead of matching the inventory number again.
              ...(entry.adopted ? { externalSystem: WATTRO_SYSTEM, externalId: entry.externalId } : {}),
            },
          })
          if (entry.adopted) adopted++
          else updated++
          if (change && current.active && !change.active) deactivated++
        }

        if (plan.creates.length > 0) {
          await tx.device.createMany({
            data: plan.creates.map((create) => ({
              ...create.fields,
              externalData: (detailsById.get(create.externalId) ?? undefined) as unknown as
                | Prisma.InputJsonObject
                | undefined,
              source: WATTRO_SYSTEM,
              externalSystem: WATTRO_SYSTEM,
              externalId: create.externalId,
            })),
          })
        }

        // The run is complete — only now does the "last synced" stamp move.
        const now = new Date()
        const run: WattroSyncCounts = {
          created: plan.creates.length,
          adopted,
          updated,
          unchanged,
          deactivated,
          invalid: activeRun.invalid + inactiveRun.invalid,
          conflictCount: plan.conflicts.length,
          conflicts: plan.conflicts.slice(0, CONFLICTS_STORED),
          fetchedActive: activeRun.items.length,
          fetchedInactive: inactiveRun.items.length,
        }
        const stamp = { key: LAST_SYNC_KEY, value: now.toISOString() }
        const summary = { key: LAST_RESULT_KEY, value: JSON.stringify(run) }
        for (const row of [stamp, summary]) {
          await tx.appSetting.upsert({ where: { key: row.key }, update: { value: row.value }, create: row })
        }
        return run
      },
      { timeout: TX_TIMEOUT_MS }
    )
  } catch (e) {
    // The transaction rolled back — nothing was written, the old stamp stands.
    // Only what kind: a Prisma error can repeat the row it refused, names and positions included.
    console.error('wattro: the sync could not be written', { error: e instanceof Error ? e.name : typeof e, code: (e as { code?: string })?.code })
    return { ok: false, error: 'database' }
  }

  return { ok: true, counts }
}
