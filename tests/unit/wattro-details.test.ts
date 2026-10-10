import { describe, expect, it } from 'vitest'
import type { WattroAsset, WattroAssetExtra } from '@/lib/wattro/assets'
import {
  buildWattroDetails,
  clusterByPosition,
  emptyLookups,
  groupByHolder,
  mapUrl,
  parseWhereFilter,
  readWattroDetails,
  sameJson,
  storesFromAssets,
  whereKindOf,
  whereName,
  type WattroLookups,
} from '@/lib/wattro/details'

const blankExtra: WattroAssetExtra = {
  createdAt: null,
  brand: null,
  model: null,
  serialNumber: null,
  notes: null,
  price: null,
  purchasedAt: null,
  tags: [],
  homeEmployee: null,
  homeStore: null,
  lastAssignAt: null,
  inspectionAt: null,
  reservationEndAt: null,
  nameplateImage: null,
  lastSeenAt: null,
  lastSeenTrigger: null,
  lastSeenByEmployeeId: null,
  lastSeenByTerminalId: null,
  positionAt: null,
  latitude: null,
  longitude: null,
  gpsMode: null,
}

function asset(over: Partial<WattroAsset> = {}, extra: Partial<WattroAssetExtra> = {}): WattroAsset {
  return {
    id: 232,
    name: 'Muster Bohrhammer',
    humanId: 'S-26',
    storageLocation: null,
    active: true,
    updatedAt: '2026-10-05T04:21:00Z',
    currentAssignment: null,
    extra: { ...blankExtra, ...extra },
    ...over,
  }
}

const lookups: WattroLookups = {
  employees: new Map([[7, 'Max Muster']]),
  projects: new Map([
    [70, { name: 'Musterstraße 1', projectNo: 'P70', address: 'Musterstraße 1, Musterstadt', finished: false }],
    [71, { name: 'Altbau Beispiel', projectNo: 'P71', address: null, finished: true }],
  ]),
  stores: new Map([[1, 'Hauptlager']]),
}

describe('buildWattroDetails', () => {
  it('names the person a machine is with, and since when', () => {
    const d = buildWattroDetails(
      asset({ currentAssignment: { assigneeId: 7, assigneeType: 'Employee' } }, { lastAssignAt: '2026-09-23T06:00:00Z' }),
      lookups
    )
    expect(d.where).toEqual({
      kind: 'employee',
      id: 7,
      name: 'Max Muster',
      projectNo: null,
      address: null,
      finished: false,
      since: '2026-09-23T06:00:00Z',
    })
  })

  it('names a site with its number and address, and flags one Wattro calls finished', () => {
    const open = buildWattroDetails(asset({ currentAssignment: { assigneeId: 70, assigneeType: 'Project' } }), lookups)
    expect(open.where).toMatchObject({ kind: 'project', name: 'Musterstraße 1', projectNo: 'P70', address: 'Musterstraße 1, Musterstadt', finished: false })
    const done = buildWattroDetails(asset({ currentAssignment: { assigneeId: 71, assigneeType: 'Project' } }), lookups)
    expect(done.where).toMatchObject({ finished: true })
  })

  it('names the store from the home stores Wattro sends inline', () => {
    const d = buildWattroDetails(asset({ currentAssignment: { assigneeId: 1, assigneeType: 'Store' } }), lookups)
    expect(d.where).toMatchObject({ kind: 'store', name: 'Hauptlager' })
  })

  it('keeps an id it cannot name, and ignores an assignee type it does not know', () => {
    expect(buildWattroDetails(asset({ currentAssignment: { assigneeId: 99, assigneeType: 'Employee' } }), lookups).where).toMatchObject({
      kind: 'employee',
      id: 99,
      name: null,
    })
    expect(buildWattroDetails(asset({ currentAssignment: { assigneeId: 1, assigneeType: 'Vehicle' } }), lookups).where).toBeNull()
  })

  it('reads the last scan with the scanner named, or the terminal', () => {
    const byPerson = buildWattroDetails(
      asset({}, { lastSeenAt: '2026-10-05T04:22:00Z', lastSeenTrigger: 'SCAN_EPC', lastSeenByEmployeeId: 7 }),
      lookups
    )
    expect(byPerson.lastSeen).toEqual({ at: '2026-10-05T04:22:00Z', trigger: 'SCAN_EPC', byEmployee: 'Max Muster', byTerminal: null })
    const byTerminal = buildWattroDetails(asset({}, { lastSeenAt: '2026-10-05T04:22:00Z', lastSeenByTerminalId: 1 }), lookups)
    expect(byTerminal.lastSeen).toMatchObject({ byEmployee: null, byTerminal: 1 })
    expect(buildWattroDetails(asset(), lookups).lastSeen).toBeNull()
  })

  it('turns Wattro’s decimal strings into a position, and drops one that is no place on earth', () => {
    expect(buildWattroDetails(asset({}, { latitude: '49.123456', longitude: '11.5' }), lookups).position).toEqual({
      at: null,
      lat: 49.123456,
      lng: 11.5,
    })
    expect(buildWattroDetails(asset({}, { latitude: '0', longitude: '0' }), lookups).position).toBeNull()
    expect(buildWattroDetails(asset({}, { latitude: '123', longitude: '11' }), lookups).position).toBeNull()
    expect(buildWattroDetails(asset({}, { latitude: '49', longitude: null }), lookups).position).toBeNull()
  })

  it('keeps only an https nameplate link — nothing a link could run', () => {
    expect(buildWattroDetails(asset({}, { nameplateImage: 'https://files.example.com/p.jpg' }), lookups).nameplateImage).toBe(
      'https://files.example.com/p.jpg'
    )
    expect(buildWattroDetails(asset({}, { nameplateImage: 'javascript:alert(1)' }), lookups).nameplateImage).toBeNull()
    expect(buildWattroDetails(asset({}, { nameplateImage: 'http://files.example.com/p.jpg' }), lookups).nameplateImage).toBeNull()
  })

  it('trims, empties to null, sorts and de-duplicates the tags', () => {
    const d = buildWattroDetails(asset({}, { brand: '  ', model: ' MX 3 ', tags: ['Säge', ' Akku', 'Säge', ''] }), lookups)
    expect(d.brand).toBeNull()
    expect(d.model).toBe('MX 3')
    expect(d.tags).toEqual(['Akku', 'Säge'])
  })

  it('works for an asset that came without its extra fields', () => {
    const d = buildWattroDetails({ ...asset(), extra: undefined }, emptyLookups())
    expect(d).toMatchObject({ wattroId: 232, where: null, tags: [], gps: false, lastSeen: null })
  })

  it('reads GPS as on only when Wattro says ENABLED', () => {
    expect(buildWattroDetails(asset({}, { gpsMode: 'ENABLED' }), lookups).gps).toBe(true)
    expect(buildWattroDetails(asset({}, { gpsMode: 'NO_GPS' }), lookups).gps).toBe(false)
  })
})

describe('storesFromAssets', () => {
  it('collects store names from the machines’ home stores', () => {
    const stores = storesFromAssets([asset({}, { homeStore: { id: 1, name: 'Hauptlager' } }), asset(), asset({}, { homeStore: { id: 2, name: 'Halle 2' } })])
    expect([...stores]).toEqual([
      [1, 'Hauptlager'],
      [2, 'Halle 2'],
    ])
  })
})

describe('readWattroDetails', () => {
  it('reads back what was built', () => {
    const d = buildWattroDetails(asset({ currentAssignment: { assigneeId: 7, assigneeType: 'Employee' } }, { tags: ['Akku'] }), lookups)
    expect(readWattroDetails(JSON.parse(JSON.stringify(d)))).toEqual(d)
  })

  it('reads nothing from a missing or foreign shape instead of failing the page', () => {
    expect(readWattroDetails(null)).toBeNull()
    expect(readWattroDetails({ v: 2 })).toBeNull()
    expect(readWattroDetails('text')).toBeNull()
  })
})

describe('sameJson', () => {
  it('ignores key order, as Postgres reorders jsonb keys', () => {
    expect(sameJson({ a: 1, b: { c: [1, 2], d: null } }, { b: { d: null, c: [1, 2] }, a: 1 })).toBe(true)
  })

  it('sees a changed value, a changed array order and a missing row', () => {
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameJson({ t: ['a', 'b'] }, { t: ['b', 'a'] })).toBe(false)
    expect(sameJson({ a: 1 }, null)).toBe(false)
  })
})

describe('whereKindOf', () => {
  const details = buildWattroDetails(asset({ currentAssignment: { assigneeId: 7, assigneeType: 'Employee' } }), lookups)

  it('follows Wattro for a machine Wattro tracks', () => {
    expect(whereKindOf(details, null)).toBe('employee')
  })

  it('lets a hand-out made here win — someone acted on it in this app', () => {
    expect(whereKindOf(details, { project: { id: 'p' }, employee: null })).toBe('project')
  })

  it('reads a device of this app’s own from its hand-out, in the store without one', () => {
    expect(whereKindOf(null, null)).toBe('store')
    expect(whereKindOf(null, { project: null, employee: { id: 'e' } })).toBe('employee')
  })
})

describe('parseWhereFilter', () => {
  it('takes the three places and falls back to all', () => {
    expect(parseWhereFilter('employee')).toBe('employee')
    expect(parseWhereFilter('project')).toBe('project')
    expect(parseWhereFilter('store')).toBe('store')
    expect(parseWhereFilter('nonsense')).toBe('all')
    expect(parseWhereFilter(undefined)).toBe('all')
  })
})

describe('mapUrl', () => {
  it('opens OpenStreetMap at the position', () => {
    expect(mapUrl({ lat: 49.1, lng: 11.25 })).toBe(
      'https://www.openstreetmap.org/?mlat=49.100000&mlon=11.250000#map=17/49.100000/11.250000'
    )
  })
})

describe('groupByHolder', () => {
  const entry = (
    over: Partial<{ kind: 'store' | 'employee' | 'project'; key: string; label: string; name: string; since: string | null; sub: string | null; finished: boolean }>
  ) => {
    const e = { kind: 'store' as const, key: 'store:1', label: 'Hauptlager', name: 'Muster', since: null, sub: null, finished: false, ...over }
    return { ...e, item: e.name }
  }

  it('puts the stores first, then the people, then the sites — each by name, site numbers as numbers', () => {
    const columns = groupByHolder([
      entry({ kind: 'project', key: 'project:10', label: 'P10 · Musterstraße' }),
      entry({ kind: 'employee', key: 'employee:2', label: 'Zora Beispiel' }),
      entry({ kind: 'project', key: 'project:9', label: 'P9 · Beispielweg' }),
      entry({ kind: 'store', key: 'store:1', label: 'Hauptlager' }),
      entry({ kind: 'employee', key: 'employee:1', label: 'Anna Muster' }),
    ])
    expect(columns.map((c) => c.label)).toEqual(['Hauptlager', 'Anna Muster', 'Zora Beispiel', 'P9 · Beispielweg', 'P10 · Musterstraße'])
  })

  it('keeps one column per place, however many machines stand there', () => {
    const columns = groupByHolder([
      entry({ kind: 'employee', key: 'employee:7', label: 'Max Muster', name: 'Leiter' }),
      entry({ kind: 'employee', key: 'employee:7', label: 'Max Muster', name: 'Bohrer' }),
    ])
    expect(columns).toHaveLength(1)
    expect(columns[0].items).toHaveLength(2)
  })

  it('stands the machines of a store by name', () => {
    const [store] = groupByHolder([entry({ name: 'Säge' }), entry({ name: 'Akku' }), entry({ name: 'Leiter 10' }), entry({ name: 'Leiter 9' })])
    expect(store.items).toEqual(['Akku', 'Leiter 9', 'Leiter 10', 'Säge'])
  })

  it('puts the machine held longest first with a person or on a site, an unknown date last', () => {
    const [person] = groupByHolder([
      entry({ kind: 'employee', key: 'employee:7', name: 'Neu', since: '2026-10-01T08:00:00Z' }),
      entry({ kind: 'employee', key: 'employee:7', name: 'Ohne Datum', since: null }),
      entry({ kind: 'employee', key: 'employee:7', name: 'Alt', since: '2026-03-01T08:00:00Z' }),
    ])
    expect(person.items).toEqual(['Alt', 'Neu', 'Ohne Datum'])
  })

  it('carries a site’s address and its finished mark to the column', () => {
    const [site] = groupByHolder([entry({ kind: 'project', key: 'project:71', label: 'P71 · Altbau', sub: 'Musterstadt', finished: true })])
    expect(site).toMatchObject({ kind: 'project', sub: 'Musterstadt', finished: true })
  })
})

describe('whereName', () => {
  const labels = {
    unknownEmployee: (id: number) => `Mitarbeiter #${id}`,
    unknownProject: (id: number) => `Projekt #${id}`,
    unknownStore: (id: number) => `Lager #${id}`,
  }
  const base = { projectNo: null, address: null, finished: false, since: null }

  it('puts a site’s number in front of its name', () => {
    expect(whereName({ ...base, kind: 'project', id: 70, name: 'Musterstraße 1', projectNo: 'P70' }, labels)).toBe('P70 · Musterstraße 1')
  })

  it('falls back to the id when Wattro did not name the place', () => {
    expect(whereName({ ...base, kind: 'employee', id: 9, name: null }, labels)).toBe('Mitarbeiter #9')
    expect(whereName({ ...base, kind: 'store', id: 2, name: null }, labels)).toBe('Lager #2')
    expect(whereName({ ...base, kind: 'project', id: 5, name: null }, labels)).toBe('Projekt #5')
  })
})

describe('clusterByPosition', () => {
  const at = (name: string, lat: number, lng: number, kind: 'store' | 'employee' | 'project' = 'store', label = 'Hauptlager') => ({
    item: name,
    lat,
    lng,
    kind,
    label,
  })

  it('pins the machines of one yard together and the biggest spot first', () => {
    const spots = clusterByPosition([
      at('Bohrer', 49.6012, 11.0021, 'project', 'P70 · Musterstraße'),
      at('Leiter', 49.7001, 11.1001),
      at('Säge', 49.70014, 11.10031), // the same yard, another corner
      at('Akku', 49.70019, 11.10009),
    ])
    expect(spots.map((s) => [s.index, s.label, s.items])).toEqual([
      [1, 'Hauptlager', ['Leiter', 'Säge', 'Akku']],
      [2, 'P70 · Musterstraße', ['Bohrer']],
    ])
  })

  it('names and colours a spot after the place most of its machines belong to', () => {
    const [spot] = clusterByPosition([
      at('A', 49.7, 11.1, 'employee', 'Max Muster'),
      at('B', 49.7, 11.1, 'store', 'Hauptlager'),
      at('C', 49.7, 11.1, 'employee', 'Max Muster'),
    ])
    expect(spot).toMatchObject({ kind: 'employee', label: 'Max Muster' })
  })

  it('pins a spot at the middle of what it gathers', () => {
    const [spot] = clusterByPosition([at('A', 49.7001, 11.1001), at('B', 49.7003, 11.1003)])
    expect(spot.lat).toBeCloseTo(49.7002, 6)
    expect(spot.lng).toBeCloseTo(11.1002, 6)
  })

  it('has nothing to pin without positions', () => {
    expect(clusterByPosition([])).toEqual([])
  })
})
