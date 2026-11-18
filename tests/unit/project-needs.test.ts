import { describe, expect, it } from 'vitest'
import {
  detectDelimiter,
  kindOrder,
  matchNeed,
  parseNeedText,
  parseNeedsList,
  planCatalogImport,
  readCatalogTable,
  resolveKind,
  splitTable,
  summarizePlan,
  type CatalogRef,
  type ExistingCatalogItem,
} from '@/lib/project-needs'
import { CATALOG_STARTER_CSV } from '@/lib/catalog-starter'

const KINDS = [
  { value: 'TOOL', labelDe: 'Werkzeug', labelEn: 'Tool' },
  { value: 'MATERIAL', labelDe: 'Material', labelEn: 'Material' },
  { value: 'WARNSCHILD', labelDe: 'Warnschild', labelEn: 'Warning sign' },
]

describe('resolveKind', () => {
  it('knows the value, both labels and the usual words', () => {
    expect(resolveKind('Werkzeug', KINDS)).toBe('TOOL')
    expect(resolveKind('tools', KINDS)).toBe('TOOL')
    expect(resolveKind('MATERIAL', KINDS)).toBe('MATERIAL')
    expect(resolveKind('Verbrauchsmaterial', KINDS)).toBe('MATERIAL')
    expect(resolveKind('Warning sign', KINDS)).toBe('WARNSCHILD')
  })
  it('says null for anything else', () => {
    expect(resolveKind('Maschine', KINDS)).toBeNull()
    expect(resolveKind('', KINDS)).toBeNull()
    expect(resolveKind(null, KINDS)).toBeNull()
  })
})

describe('splitTable', () => {
  it('reads what Excel copies (tabs)', () => {
    expect(splitTable('Material\tTiefgrund\tLiter\n\nWerkzeug\tLeiter\t')).toEqual([
      ['Material', 'Tiefgrund', 'Liter'],
      ['Werkzeug', 'Leiter', ''],
    ])
  })
  it('reads a German CSV with quotes', () => {
    expect(splitTable('Art;Name\r\nMaterial;"Farbe; weiß ""matt"""')).toEqual([
      ['Art', 'Name'],
      ['Material', 'Farbe; weiß "matt"'],
    ])
  })
  it('does not split a decimal comma', () => {
    expect(detectDelimiter(['Gipskarton 12,5 mm'])).toBeNull()
    expect(detectDelimiter(['Material, Tiefgrund', 'Werkzeug, Leiter'])).toBe(',')
  })
})

describe('readCatalogTable', () => {
  it('finds the columns by their header', () => {
    const table = splitTable('Bezeichnung;Einheit;Art;Kategorie\nTiefgrund;Liter;Material;Grundierung\nLeiter;;Werkzeug;Zugang')
    const { rows, issues, hasHeader } = readCatalogTable(table, KINDS, 'MATERIAL')
    expect(hasHeader).toBe(true)
    expect(issues).toEqual([])
    expect(rows).toEqual([
      { line: 2, kind: 'MATERIAL', name: 'Tiefgrund', category: 'Grundierung', unit: 'Liter', location: null, notes: null },
      { line: 3, kind: 'TOOL', name: 'Leiter', category: 'Zugang', unit: null, location: null, notes: null },
    ])
  })
  it('reads kind, name, category, unit without a header', () => {
    const { rows, hasHeader } = readCatalogTable(splitTable('Material;Malerkrepp;Abdecken;Rolle'), KINDS, 'TOOL')
    expect(hasHeader).toBe(false)
    expect(rows[0]).toMatchObject({ kind: 'MATERIAL', name: 'Malerkrepp', category: 'Abdecken', unit: 'Rolle' })
  })
  it('takes a plain list of names as the chosen kind', () => {
    const { rows } = readCatalogTable(splitTable('Quast\nFlächenspachtel\n'), KINDS, 'TOOL')
    expect(rows.map((r) => [r.kind, r.name])).toEqual([
      ['TOOL', 'Quast'],
      ['TOOL', 'Flächenspachtel'],
    ])
  })
  it('reports rows without a name or with an unknown kind', () => {
    const { rows, issues } = readCatalogTable(splitTable('Art;Name\nMaterial;\nMaschine;Rüttelplatte\nMaterial;Acryl'), KINDS, 'TOOL')
    expect(rows.map((r) => r.name)).toEqual(['Acryl'])
    expect(issues).toEqual([
      { line: 2, problem: 'noName', text: 'Material' },
      { line: 3, problem: 'unknownKind', text: 'Maschine · Rüttelplatte' },
    ])
  })
})

describe('planCatalogImport', () => {
  const existing: ExistingCatalogItem[] = [
    { id: 'a', kind: 'MATERIAL', name: 'Tiefgrund', category: null, unit: 'Liter', location: null, notes: null },
    { id: 'b', kind: 'TOOL', name: 'Leiter', category: 'Zugang', unit: null, location: null, notes: null },
  ]
  const row = (kind: string, name: string, extra: Partial<Record<'category' | 'unit', string>> = {}) => ({
    line: 1,
    kind,
    name,
    category: extra.category ?? null,
    unit: extra.unit ?? null,
    location: null,
    notes: null,
  })

  it('finds an entry by kind and name, without case or spaces counting', () => {
    const plan = planCatalogImport([row('MATERIAL', '  tiefgrund ', { unit: 'Eimer', category: 'Grundierung' })], existing)
    // The unit the office typed stays; the empty category is filled.
    expect(plan[0]).toMatchObject({ action: 'fill', existingId: 'a', fills: { category: 'Grundierung' } })
  })
  it('the same name of another kind is another entry', () => {
    expect(planCatalogImport([row('TOOL', 'Tiefgrund')], existing)[0].action).toBe('create')
  })
  it('says same when there is nothing to add, repeat for a second line', () => {
    const plan = planCatalogImport([row('TOOL', 'Leiter', { category: 'Anders' }), row('MATERIAL', 'Acryl'), row('MATERIAL', 'ACRYL')], existing)
    expect(plan.map((p) => p.action)).toEqual(['same', 'create', 'repeat'])
    expect(summarizePlan(plan)).toEqual({ create: 1, fill: 0, same: 1, repeat: 1 })
  })
})

describe('parseNeedText', () => {
  it.each([
    ['10 Eimer Dispersionsfarbe weiß', 'Dispersionsfarbe weiß', 10, 'Eimer'],
    ['10x Malerkrepp', 'Malerkrepp', 10, null],
    ['10 x Malerkrepp', 'Malerkrepp', 10, null],
    ['2,5 l Tiefgrund', 'Tiefgrund', 2.5, 'l'],
    ['5l Tiefgrund', 'Tiefgrund', 5, 'l'],
    ['3 Farbrollen', 'Farbrollen', 3, null],
    ['Malerkrepp: 30 Rollen', 'Malerkrepp', 30, 'Rollen'],
    ['Malerkrepp 30 Rollen', 'Malerkrepp', 30, 'Rollen'],
    ['Abdeckfolie - 4', 'Abdeckfolie', 4, null],
    ['Farbrolle 2x', 'Farbrolle', 2, null],
    ['Farbrolle x 2', 'Farbrolle', 2, null],
    ['- Quast', 'Quast', null, null],
    ['1. Spachtelmasse', 'Spachtelmasse', null, null],
  ])('%s', (text, name, quantity, unit) => {
    expect(parseNeedText(text)).toMatchObject({ name, quantity, unit })
  })
  it('keeps sizes in the name', () => {
    expect(parseNeedText('Gipskartonplatte 12,5 mm')).toMatchObject({ name: 'Gipskartonplatte 12,5 mm', quantity: null })
    expect(parseNeedText('Spachtel 60')).toMatchObject({ name: 'Spachtel 60', quantity: null })
  })
  it('takes a closing bracket as the note', () => {
    expect(parseNeedText('2 Farbrollen (Ersatz für Bad)')).toMatchObject({ name: 'Farbrollen', quantity: 2, note: 'Ersatz für Bad' })
  })
  it('is null for a line with nothing in it', () => {
    expect(parseNeedText('  - ')).toBeNull()
  })
})

describe('parseNeedsList', () => {
  it('reads one thing per line, the line numbers kept', () => {
    const lines = parseNeedsList('10 Eimer Tiefgrund\n\nLeiter\n', KINDS)
    expect(lines.map((l) => [l.line, l.name, l.quantity])).toEqual([
      [1, 'Tiefgrund', 10],
      [3, 'Leiter', null],
    ])
  })
  it('reads cells copied from a sheet and drops the header', () => {
    const lines = parseNeedsList('Menge\tEinheit\tBezeichnung\tArt\n12\tRollen\tMalerkrepp\tMaterial\n1\t\tLeiter\tWerkzeug\tfür Treppenhaus', KINDS)
    expect(lines).toEqual([
      { line: 2, text: '12\tRollen\tMalerkrepp\tMaterial', name: 'Malerkrepp', quantity: 12, unit: 'Rollen', note: null, kind: 'MATERIAL' },
      { line: 3, text: '1\t\tLeiter\tWerkzeug\tfür Treppenhaus', name: 'Leiter', quantity: 1, unit: null, note: 'für Treppenhaus', kind: 'TOOL' },
    ])
  })
})

describe('matchNeed', () => {
  const catalog: CatalogRef[] = [
    { id: '1', kind: 'MATERIAL', name: 'Dispersionsfarbe weiß', unit: 'Eimer' },
    { id: '2', kind: 'MATERIAL', name: 'Malerkrepp', unit: 'Rolle' },
    { id: '3', kind: 'TOOL', name: 'Farbrolle', unit: null },
    { id: '4', kind: 'TOOL', name: 'Spachtel', unit: null },
    { id: '5', kind: 'MATERIAL', name: 'Spachtelmasse', unit: 'Sack' },
    { id: '6', kind: 'TOOL', name: 'Leiter', unit: null },
    { id: '7', kind: 'TOOL', name: 'Stehleiter', unit: null },
  ]
  it('finds the same name', () => {
    expect(matchNeed({ name: 'malerkrepp', kind: null }, catalog)).toMatchObject({ item: { id: '2' }, how: 'exact' })
  })
  it('finds a plural', () => {
    expect(matchNeed({ name: 'Farbrollen', kind: null }, catalog)).toMatchObject({ item: { id: '3' }, how: 'close' })
  })
  it('finds the one entry holding the word', () => {
    expect(matchNeed({ name: 'Dispersionsfarbe', kind: null }, catalog)).toMatchObject({ item: { id: '1' }, how: 'close' })
  })
  it('does not take Spachtel for Spachtelmasse', () => {
    expect(matchNeed({ name: 'Spachtel', kind: null }, catalog).item?.id).toBe('4')
    expect(matchNeed({ name: 'Spachtelmasse', kind: null }, catalog).item?.id).toBe('5')
  })
  it('a kind narrows the choice', () => {
    expect(matchNeed({ name: 'Malerkrepp', kind: 'TOOL' }, catalog).item).toBeNull()
  })
  it('finds nothing for something unknown', () => {
    expect(matchNeed({ name: 'Silikon', kind: null }, catalog)).toEqual({ item: null, how: null, candidates: [] })
  })
  it('offers several when several fit', () => {
    const twice: CatalogRef[] = [
      { id: 'a', kind: 'MATERIAL', name: 'Acryl weiß', unit: null },
      { id: 'b', kind: 'MATERIAL', name: 'Acryl grau', unit: null },
    ]
    expect(matchNeed({ name: 'Acryl', kind: null }, twice).candidates.map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('kindOrder', () => {
  it('puts material first, tools second, the rest after', () => {
    expect(kindOrder(KINDS).map((k) => k.value)).toEqual(['MATERIAL', 'TOOL', 'WARNSCHILD'])
  })
})

describe('the starter catalogue', () => {
  it('reads without a problem and has no entry twice', () => {
    const { rows, issues, hasHeader } = readCatalogTable(splitTable(CATALOG_STARTER_CSV), KINDS, 'MATERIAL')
    expect(hasHeader).toBe(true)
    expect(issues).toEqual([])
    expect(rows.length).toBeGreaterThan(40)
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(['MATERIAL', 'TOOL']))
    expect(summarizePlan(planCatalogImport(rows, [])).repeat).toBe(0)
  })
})
