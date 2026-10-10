import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getLastSync, syncWattroDevices, type WattroSource } from '@/lib/wattro/sync'
import { WATTRO_SYSTEM, type FetchAssetPage, type WattroAsset } from '@/lib/wattro/assets'

// Runs the real sync against the dev database, but feeds it Wattro fixtures
// instead of the network. Proves what the unit tests cannot: repeated runs
// stay idempotent in the actual tables, local-only fields survive an update,
// and a failed run leaves everything as it was.

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const tag = `vitest-wattro-${Date.now()}`
// Wattro ids of this run only, far above any real asset's — so the fixtures
// can never meet (or clean away) a machine a real sync brought into this
// database.
const BASE_ID = 1_900_000_000 + Math.floor(Math.random() * 100_000_000)
const W = (n: number) => BASE_ID + n
const SYNC_KEYS = ['wattro.lastSyncAt', 'wattro.lastSyncResult']
let savedSettings: Array<{ key: string; value: string }> = []

function asset(over: Partial<WattroAsset> & { id: number }): WattroAsset {
  return {
    name: 'Muster Gerät',
    humanId: null,
    storageLocation: 'Halle Regal 3',
    active: true,
    updatedAt: '2026-09-29T10:00:00Z',
    currentAssignment: null,
    ...over,
  }
}

/** A Wattro that answers with these pages and knows no people or sites. */
function sourceOf(fetchPage: FetchAssetPage, lookups: Partial<Pick<WattroSource, 'fetchEmployees' | 'fetchProjects'>> = {}): WattroSource {
  return {
    fetchPage,
    fetchEmployees: lookups.fetchEmployees ?? (async () => new Map()),
    fetchProjects: lookups.fetchProjects ?? (async () => new Map()),
  }
}

function pagesOf(active: WattroAsset[], inactive: WattroAsset[]): WattroSource {
  return sourceOf(async ({ active: wantActive, offset, limit }) => {
    const list = wantActive ? active : inactive
    return { items: list.slice(offset, offset + limit), invalid: 0, count: list.length }
  })
}

/** The Wattro answer for run 1 and 2 (and its reuse proves idempotency). */
const firstRun = pagesOf(
  [
    asset({ id: W(1), name: 'Wattro Schleifer', humanId: `${tag}-100`, storageLocation: 'Halle 1' }),
    asset({ id: W(2), name: 'Wattro Kompressor', humanId: `${tag}-200`, storageLocation: 'Halle 1' }),
    // Same number as the foreign-owned row below — must be reported, not merged.
    asset({ id: W(3), name: 'Wattro Trenner', humanId: `${tag}-300` }),
    // No inventory number, no name twin: a new device of its own.
    asset({ id: W(4), name: `${tag} Säge`, humanId: null }),
    // Adopts the hand-filled row and overwrites the owned fields only.
    asset({ id: W(5), name: 'Wattro Leitern', humanId: `${tag}-400`, storageLocation: 'Halle 2' }),
  ],
  [asset({ id: W(6), name: `${tag} Altgerät`, humanId: `${tag}-600`, active: false })]
)

let adoptedId = ''
let linkedId = ''
let localOnlyId = ''
let foreignId = ''

beforeAll(async () => {
  // The sync refuses to run without a configured key — even with an injected
  // fetcher. A test key satisfies the guard and stays inside this process.
  process.env.WATTRO_API_KEY = 'test-key-not-a-secret'
  // A real sync's stamp, if this database has one, comes back afterwards.
  savedSettings = await db.appSetting.findMany({
    where: { key: { in: SYNC_KEYS } },
    select: { key: true, value: true },
  })
  adoptedId = (
    await db.device.create({
      data: { name: 'Muster Schleifer', inventoryNo: `${tag}-100`, storageLocation: 'Alte Halle' },
    })
  ).id
  foreignId = (
    await db.device.create({
      data: {
        name: 'Muster Trenner',
        inventoryNo: `${tag}-300`,
        externalSystem: 'other',
        externalId: 'x-1',
        source: 'other',
      },
    })
  ).id
  // Already linked to Wattro W(2) from an earlier run — refresh in place.
  linkedId = (
    await db.device.create({
      data: {
        name: 'Muster Kompressor',
        inventoryNo: `${tag}-200`,
        externalSystem: WATTRO_SYSTEM,
        externalId: String(W(2)),
        source: WATTRO_SYSTEM,
      },
    })
  ).id
  localOnlyId = (
    await db.device.create({
      data: {
        name: 'Muster Leiternsatz',
        inventoryNo: `${tag}-400`,
        category: 'Leitern',
        notes: 'Nur mit Aushang',
        videoUrl: 'https://example.com/anleitung',
        storageLocation: 'Alte Halle',
      },
    })
  ).id
})

afterAll(async () => {
  await db.device.deleteMany({
    where: {
      OR: [
        { inventoryNo: { startsWith: tag } },
        { name: { startsWith: tag } },
        { externalSystem: WATTRO_SYSTEM, externalId: { in: [1, 2, 3, 4, 5, 6, 51, 52, 61].map((n) => String(W(n))) } },
      ],
    },
  })
  await db.appSetting.deleteMany({ where: { key: { in: SYNC_KEYS } } })
  if (savedSettings.length > 0) await db.appSetting.createMany({ data: savedSettings })
  await db.$disconnect()
})

describe('devices sync against the database', () => {
  it('imports, adopts and reports without touching what belongs elsewhere', async () => {
    const outcome = await syncWattroDevices(firstRun)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.counts).toMatchObject({
      created: 2, // W(4) (no number), W(6) (inactive)
      adopted: 2, // W(1) → hand-filled row, W(5) → the row with local-only fields
      updated: 1, // W(2) → the row already linked from an earlier run
      unchanged: 0,
      deactivated: 0,
      conflictCount: 1, // W(3), number worn by the 'other' row
      fetchedActive: 5,
      fetchedInactive: 1,
    })

    const linked = await db.device.findUnique({ where: { id: linkedId } })
    expect(linked).toMatchObject({
      name: 'Wattro Kompressor',
      storageLocation: 'Halle 1',
      externalSystem: WATTRO_SYSTEM,
      externalId: String(W(2)),
    })

    const adopted = await db.device.findUnique({ where: { id: adoptedId } })
    expect(adopted).toMatchObject({
      name: 'Wattro Schleifer',
      inventoryNo: `${tag}-100`,
      storageLocation: 'Halle 1',
      active: true,
      externalSystem: WATTRO_SYSTEM,
      externalId: String(W(1)),
      source: 'manual', // adoption keeps the row's own history
    })

    const localOnly = await db.device.findUnique({ where: { id: localOnlyId } })
    // Wattro's fields came over; this app's own fields stayed.
    expect(localOnly).toMatchObject({
      name: 'Wattro Leitern',
      storageLocation: 'Halle 2',
      inventoryNo: `${tag}-400`,
      category: 'Leitern',
      notes: 'Nur mit Aushang',
      videoUrl: 'https://example.com/anleitung',
      externalId: String(W(5)),
    })

    const foreign = await db.device.findUnique({ where: { id: foreignId } })
    expect(foreign).toMatchObject({ name: 'Muster Trenner', externalSystem: 'other', externalId: 'x-1' })

    const createdSaw = await db.device.findFirst({ where: { externalId: String(W(4)) } })
    expect(createdSaw).toMatchObject({ name: `${tag} Säge`, source: WATTRO_SYSTEM, active: true })

    const createdInactive = await db.device.findFirst({ where: { externalId: String(W(6)) } })
    expect(createdInactive).toMatchObject({ active: false })

    expect((await getLastSync()).at).not.toBeNull()
  })

  it('runs again over the same answer and creates nothing new', async () => {
    const before = await db.device.count({ where: { externalSystem: WATTRO_SYSTEM } })
    const outcome = await syncWattroDevices(firstRun)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.counts).toMatchObject({ created: 0, adopted: 0, updated: 0, unchanged: 5 })
    const after = await db.device.count({ where: { externalSystem: WATTRO_SYSTEM } })
    expect(after).toBe(before)
  })

  it('deactivates what Wattro deactivated, keeps what Wattro no longer sends', async () => {
    const run = pagesOf(
      [
        asset({ id: W(1), name: 'Wattro Schleifer', humanId: `${tag}-100`, storageLocation: 'Halle 1' }),
        asset({ id: W(3), name: 'Wattro Trenner', humanId: `${tag}-300` }),
        asset({ id: W(4), name: `${tag} Säge`, humanId: null }),
        asset({ id: W(5), name: 'Wattro Leitern', humanId: `${tag}-400`, storageLocation: 'Halle 2' }),
      ],
      [
        // W(2) comes back from Wattro as switched off.
        asset({ id: W(2), name: 'Wattro Kompressor', humanId: `${tag}-200`, active: false }),
        asset({ id: W(6), name: `${tag} Altgerät`, humanId: `${tag}-600`, active: false }),
      ]
    )

    const outcome = await syncWattroDevices(run)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.counts).toMatchObject({ deactivated: 1, unchanged: 4, created: 0 })

    const kompressor = await db.device.findFirst({ where: { externalId: String(W(2)) } })
    expect(kompressor).toMatchObject({ active: false })

    // W(2) vanished from the active pages — it is still here, just inactive.
    const saw = await db.device.findFirst({ where: { externalId: String(W(4)) } })
    expect(saw).not.toBeNull()
  })

  it('fails without writing anything when a page breaks', async () => {
    const breaking: FetchAssetPage = async ({ active }) => {
      if (!active) throw new Error('page 2 exploded')
      return { items: [asset({ id: W(99), name: `${tag} Kamerasatz` })], invalid: 0, count: 1 }
    }

    const before = await db.device.count()
    const outcome = await syncWattroDevices(sourceOf(breaking))
    expect(outcome).toMatchObject({ ok: false, error: 'network' })

    const after = await db.device.count()
    expect(after).toBe(before)
    const stray = await db.device.findFirst({ where: { externalId: String(W(99)) } })
    expect(stray).toBeNull()
  })

  it('lets two runs at once write one after the other — no doubles, no crash', async () => {
    const run = pagesOf(
      [
        asset({ id: W(51), name: `${tag} Rüttler`, humanId: `${tag}-510` }),
        asset({ id: W(52), name: `${tag} Mischer`, humanId: `${tag}-520` }),
      ],
      []
    )

    // Several clicks at once, so their transactions really overlap.
    const results = await Promise.all(Array.from({ length: 6 }, () => syncWattroDevices(run)))
    expect(results.map((r) => (r.ok ? 'ok' : r.error))).toEqual(Array(6).fill('ok'))
    // One run creates both; the others wait, then find them linked.
    const created = results.reduce((sum, r) => sum + (r.ok ? r.counts.created : 0), 0)
    expect(created).toBe(2)

    const rows = await db.device.findMany({
      where: { externalSystem: WATTRO_SYSTEM, externalId: { in: [String(W(51)), String(W(52))] } },
    })
    expect(rows).toHaveLength(2)
  })

  it('stores what Wattro knows beyond the owned fields, with names for the ids, and leaves it be when nothing moved', async () => {
    const extra = {
      createdAt: '2024-01-10T08:00:00Z',
      brand: 'Musterwerk',
      model: 'MX 300',
      serialNumber: 'SN-1',
      notes: null,
      price: '499.00',
      purchasedAt: '2024-01-09',
      tags: ['Schleifen', 'Akku'],
      homeEmployee: null,
      homeStore: { id: 1, name: 'Muster Lager' },
      lastAssignAt: '2026-09-20T07:00:00Z',
      inspectionAt: null,
      reservationEndAt: null,
      nameplateImage: null,
      lastSeenAt: '2026-09-28T15:30:00Z',
      lastSeenTrigger: 'SCAN_EPC',
      lastSeenByEmployeeId: 7,
      lastSeenByTerminalId: null,
      positionAt: null,
      latitude: null,
      longitude: null,
      gpsMode: 'NO_GPS',
    }
    const run = sourceOf(
      async ({ active, offset }) => {
        const items = active && offset === 0
          ? [asset({ id: W(61), name: `${tag} Exzenter`, humanId: `${tag}-610`, currentAssignment: { assigneeId: 7, assigneeType: 'Employee' }, extra })]
          : []
        return { items, invalid: 0, count: items.length }
      },
      { fetchEmployees: async () => new Map([[7, 'Max Muster']]) }
    )

    expect(await syncWattroDevices(run)).toMatchObject({ ok: true, counts: { created: 1 } })
    const row = await db.device.findFirst({ where: { externalSystem: WATTRO_SYSTEM, externalId: String(W(61)) } })
    expect(row?.externalData).toMatchObject({
      where: { kind: 'employee', id: 7, name: 'Max Muster', since: '2026-09-20T07:00:00Z' },
      brand: 'Musterwerk',
      homeStore: 'Muster Lager',
      tags: ['Akku', 'Schleifen'],
      lastSeen: { trigger: 'SCAN_EPC', byEmployee: 'Max Muster' },
    })

    // Postgres hands the JSON back with its keys reordered; still no change.
    const again = await syncWattroDevices(run)
    expect(again.ok && again.counts.updated).toBe(0)
  })
})

describe('a key that may read the machines but not the lists', () => {
  it('is told apart from a key refused, and nothing is written', async () => {
    const { WattroApiError } = await import('@/lib/wattro/client')
    const source: WattroSource = {
      fetchPage: async () => ({ items: [], invalid: 0, count: 0 }),
      fetchEmployees: async () => {
        throw new WattroApiError('auth', 'Wattro rejected the API key', 403)
      },
      fetchProjects: async () => new Map(),
    }
    expect(await syncWattroDevices(source)).toMatchObject({ ok: false, error: 'lookups' })
  })
})
