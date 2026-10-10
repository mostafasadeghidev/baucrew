import { describe, expect, it } from 'vitest'
import {
  ASSET_PAGE_SIZE,
  collectAssets,
  deviceChange,
  mapAssetToDeviceInfo,
  planAssetSync,
  type FetchAssetPage,
  type LocalDeviceRow,
  type WattroAsset,
} from '@/lib/wattro/assets'

function asset(over: Partial<WattroAsset> & { id: number }): WattroAsset {
  return {
    name: 'Muster Schleifer',
    humanId: null,
    storageLocation: 'Halle Regal 3',
    active: true,
    updatedAt: '2026-09-29T10:00:00Z',
    currentAssignment: null,
    ...over,
  }
}

function device(over: Partial<LocalDeviceRow> & { id: string }): LocalDeviceRow {
  return {
    name: 'Muster Gerät',
    inventoryNo: null,
    storageLocation: null,
    active: true,
    externalSystem: null,
    externalId: null,
    ...over,
  }
}

describe('mapAssetToDeviceInfo', () => {
  it('takes the four owned fields and trims them', () => {
    const fields = mapAssetToDeviceInfo(
      asset({ id: 1, name: '  Muster Schleifer ', humanId: ' G-100 ', storageLocation: ' Halle ' })
    )
    expect(fields).toEqual({
      name: 'Muster Schleifer',
      inventoryNo: 'G-100',
      storageLocation: 'Halle',
      active: true,
    })
  })

  it('reads empty strings as missing', () => {
    const fields = mapAssetToDeviceInfo(asset({ id: 2, humanId: '   ', storageLocation: '' }))
    expect(fields.inventoryNo).toBeNull()
    expect(fields.storageLocation).toBeNull()
  })

  it('carries the inactive mark', () => {
    expect(mapAssetToDeviceInfo(asset({ id: 3, active: false })).active).toBe(false)
  })
})

describe('planAssetSync', () => {
  it('refreshes a row Wattro already owns, found by the stored external id', () => {
    const local = [device({ id: 'd1', externalSystem: 'wattro', externalId: '11' })]
    const plan = planAssetSync([asset({ id: 11, name: 'Neuer Name' })], local)
    expect(plan.updates).toEqual([
      {
        deviceId: 'd1',
        externalId: '11',
        adopted: false,
        fields: { name: 'Neuer Name', inventoryNo: null, storageLocation: 'Halle Regal 3', active: true },
      },
    ])
    expect(plan.creates).toEqual([])
    expect(plan.conflicts).toEqual([])
  })

  it('adopts one unlinked local row by its inventory number, forgiving case and spaces', () => {
    const local = [device({ id: 'd2', inventoryNo: ' g-100 ' })]
    const plan = planAssetSync([asset({ id: 12, humanId: 'G-100' })], local)
    expect(plan.updates).toEqual([
      { deviceId: 'd2', externalId: '12', adopted: true, fields: expect.any(Object) },
    ])
  })

  it('never merges by name alone — an unknown asset becomes a new device', () => {
    const local = [device({ id: 'd3', name: 'Muster Schleifer' })]
    const plan = planAssetSync([asset({ id: 13, name: 'Muster Schleifer', humanId: null })], local)
    expect(plan.updates).toEqual([])
    expect(plan.creates).toEqual([
      {
        externalId: '13',
        fields: { name: 'Muster Schleifer', inventoryNo: null, storageLocation: 'Halle Regal 3', active: true },
      },
    ])
  })

  it('reports instead of guessing when two free rows wear the same number', () => {
    const local = [
      device({ id: 'd4', inventoryNo: 'G-100' }),
      device({ id: 'd5', inventoryNo: 'g-100' }),
    ]
    const plan = planAssetSync([asset({ id: 14, humanId: 'G-100' })], local)
    expect(plan.updates).toEqual([])
    expect(plan.conflicts).toEqual([
      { externalId: '14', name: 'Muster Schleifer', inventoryNo: 'G-100', reason: 'inventoryAmbiguous' },
    ])
  })

  it('does not steal a number worn by a row of another system', () => {
    const local = [device({ id: 'd6', inventoryNo: 'G-100', externalSystem: 'other', externalId: 'x' })]
    const plan = planAssetSync([asset({ id: 15, humanId: 'G-100' })], local)
    expect(plan.conflicts[0].reason).toBe('inventoryTaken')
  })

  it('does not steal a number worn by a Wattro row of another id (renumbered there)', () => {
    const local = [device({ id: 'd7', inventoryNo: 'G-100', externalSystem: 'wattro', externalId: '99' })]
    const plan = planAssetSync([asset({ id: 16, humanId: 'G-100' })], local)
    expect(plan.conflicts[0].reason).toBe('inventoryTaken')
  })

  it('counts a Wattro id sent twice once, by its newest record', () => {
    // Read once in the active list, once in the inactive one: switched off in between.
    const local = [device({ id: 'd8', externalSystem: 'wattro', externalId: '17' })]
    const plan = planAssetSync(
      [
        asset({ id: 17, active: true, updatedAt: '2026-09-29T10:00:00Z' }),
        asset({ id: 17, active: false, updatedAt: '2026-09-29T10:05:00Z' }),
      ],
      local
    )
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].fields.active).toBe(false)
    expect(plan.conflicts).toEqual([])
  })

  it('keeps the newest record of a twice-sent id even when it comes first', () => {
    const plan = planAssetSync(
      [
        asset({ id: 18, name: 'Neu', updatedAt: '2026-09-29T11:00:00Z' }),
        asset({ id: 18, name: 'Alt', updatedAt: '2026-09-29T09:00:00Z' }),
      ],
      []
    )
    expect(plan.creates).toEqual([{ externalId: '18', fields: expect.objectContaining({ name: 'Neu' }) }])
  })

  it('does not hand one free row to two Wattro assets wearing the same number', () => {
    const local = [device({ id: 'd9', inventoryNo: 'G-200' })]
    const plan = planAssetSync(
      [asset({ id: 19, name: 'Erster', humanId: 'G-200' }), asset({ id: 20, name: 'Zweiter', humanId: 'g-200 ' })],
      local
    )
    expect(plan.updates).toEqual([])
    expect(plan.creates).toEqual([])
    expect(plan.conflicts.map((c) => [c.externalId, c.reason])).toEqual([
      ['19', 'inventoryAmbiguous'],
      ['20', 'inventoryAmbiguous'],
    ])
  })

  it('still adopts when the number’s twin in Wattro is already linked elsewhere', () => {
    // Asset 21 is linked to d10; only asset 22 is looking for a row, so d11 is no guess.
    const local = [
      device({ id: 'd10', inventoryNo: 'G-300', externalSystem: 'wattro', externalId: '21' }),
      device({ id: 'd11', inventoryNo: 'G-300' }),
    ]
    const plan = planAssetSync([asset({ id: 21, humanId: 'G-300' }), asset({ id: 22, humanId: 'G-300' })], local)
    expect(plan.updates.map((u) => [u.deviceId, u.externalId, u.adopted])).toEqual([
      ['d10', '21', false],
      ['d11', '22', true],
    ])
    expect(plan.conflicts).toEqual([])
  })

  it('creates both when two Wattro assets share a number no local row wears', () => {
    const plan = planAssetSync([asset({ id: 23, humanId: 'G-400' }), asset({ id: 24, humanId: 'G-400' })], [])
    expect(plan.creates.map((c) => c.externalId)).toEqual(['23', '24'])
  })
})

describe('deviceChange', () => {
  const current = { name: 'A', inventoryNo: 'G-1', storageLocation: 'Halle', active: true }

  it('is null when Wattro brings nothing new', () => {
    expect(deviceChange({ name: 'A', inventoryNo: 'G-1', storageLocation: 'Halle', active: true }, current)).toBeNull()
  })

  it('sees each owned field change', () => {
    expect(deviceChange({ ...current, name: 'B' }, current)).toEqual({ ...current, name: 'B' })
    expect(deviceChange({ ...current, active: false }, current)).toEqual({ ...current, active: false })
    expect(deviceChange({ ...current, storageLocation: 'Regal 5' }, current)).not.toBeNull()
  })
})

describe('collectAssets', () => {
  function fullPages(pages: Array<{ items: WattroAsset[]; invalid?: number; count?: number }>): {
    fetch: FetchAssetPage
    calls: Array<{ active: boolean; offset: number }>
  } {
    const calls: Array<{ active: boolean; offset: number }> = []
    let page = 0
    return {
      calls,
      fetch: async (params) => {
        calls.push({ active: params.active, offset: params.offset })
        const p = pages[Math.min(page, pages.length - 1)]
        page++
        return { items: p.items, invalid: p.invalid ?? 0, count: p.count ?? p.items.length }
      },
    }
  }

  it('walks every page until Wattro’s count is reached', async () => {
    const hundred = Array.from({ length: ASSET_PAGE_SIZE }, (_, i) => asset({ id: i + 1 }))
    const fifty = Array.from({ length: 50 }, (_, i) => asset({ id: 1000 + i }))
    const { fetch, calls } = fullPages([
      { items: hundred, count: 250 },
      { items: hundred, count: 250 },
      { items: fifty, count: 250 },
    ])
    const run = await collectAssets(fetch, true)
    expect(run.items).toHaveLength(250)
    expect(calls.map((c) => c.offset)).toEqual([0, 100, 200])
  })

  it('stops at a short page even when the count claims more', async () => {
    const { fetch, calls } = fullPages([{ items: [asset({ id: 1 })], count: 500 }])
    const run = await collectAssets(fetch, true)
    expect(run.items).toHaveLength(1)
    expect(calls).toHaveLength(1)
  })

  it('adds up the skipped records of every page', async () => {
    const { fetch } = fullPages([
      { items: Array.from({ length: 98 }, (_, i) => asset({ id: i + 1 })), invalid: 2, count: 150 },
      { items: Array.from({ length: 49 }, (_, i) => asset({ id: 500 + i })), invalid: 1, count: 150 },
    ])
    const run = await collectAssets(fetch, true)
    expect(run.items).toHaveLength(147)
    expect(run.invalid).toBe(3)
  })

  it('reads on past a full page that had a broken record in it', async () => {
    // 100 records sent, one unusable: the page is full, not the last one.
    const { fetch, calls } = fullPages([
      { items: Array.from({ length: 99 }, (_, i) => asset({ id: i + 1 })), invalid: 1, count: 250 },
      { items: Array.from({ length: 100 }, (_, i) => asset({ id: 200 + i })), count: 250 },
      { items: Array.from({ length: 50 }, (_, i) => asset({ id: 400 + i })), count: 250 },
    ])
    const run = await collectAssets(fetch, true)
    expect(calls.map((c) => c.offset)).toEqual([0, 100, 200])
    expect(run.items).toHaveLength(249)
    expect(run.invalid).toBe(1)
  })

  it('lets a failed page bubble up — the run records nothing', async () => {
    const fetch: FetchAssetPage = async () => {
      throw new Error('upstream down')
    }
    await expect(collectAssets(fetch, true)).rejects.toThrow('upstream down')
  })
})
