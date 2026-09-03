import { describe, expect, it } from 'vitest'
import {
  bucketKey,
  mergePlanSheets,
  parsePlanGrid,
  planTotals,
  type Grid,
} from '@/lib/year-plan-excel'

/**
 * A year-planning sheet in miniature: two months side by side, own-crew rows
 * on top, the SUB section below, subtotals in between. Invented sites only.
 */
function sheet(): Grid {
  return [
    ['Monat Januar', null, null, 'Monat Februar', null],
    ['Baustelle', 'Planumsatz netto', null, 'Baustelle', 'Planumsatz netto'],
    ['Musterhof Fassade', 20000, null, 'Beispielweg 4', 15000],
    ['Musterstadt Schule', 5000, null, null, null],
    ['Eigene Leute', 25000, null, 'Eigene Leute', 15000],
    ['SUB', null, null, null, null],
    ['Musterputz GmbH', 8000, null, 'Beispiel Trockenbau', 3000],
    ['SUB', 8000, null, 'SUB', 3000],
    ['Geplanter Umsatz', 33000, null, 'Geplanter Umsatz', 18000],
  ]
}

describe('year plan sheet', () => {
  it('reads a month block with its own and SUB sections', () => {
    const parsed = parsePlanGrid(sheet(), '2026')
    expect(parsed).not.toBeNull()
    expect(parsed!.year).toBe(2026)

    const january = parsed!.entries.filter((e) => e.month === 1)
    expect(january.map((e) => e.name)).toEqual([
      'Musterhof Fassade',
      'Musterstadt Schule',
      'Musterputz GmbH',
    ])
    expect(january.filter((e) => e.isSub).map((e) => e.amount)).toEqual([8000])
  })

  it('never turns a subtotal line into a site', () => {
    const names = parsePlanGrid(sheet(), '2026')!.entries.map((e) => e.name)
    expect(names).not.toContain('Eigene Leute')
    expect(names).not.toContain('SUB')
    expect(names).not.toContain('Geplanter Umsatz')
  })

  it('adds a month up the way the sheet does', () => {
    const parsed = parsePlanGrid(sheet(), '2026')!
    const totals = planTotals(parsed.entries, 2026)
    expect(totals.months[0]).toEqual({ month: 1, own: 25000, sub: 8000, total: 33000 })
    expect(totals.months[1]).toEqual({ month: 2, own: 15000, sub: 3000, total: 18000 })
    expect(totals.yearTotal).toBe(51000)
  })

  it('treats everything below the own-crew total as SUB, even without a caption', () => {
    // February's "SUB" caption cell is empty — the columns share one label.
    const grid = sheet()
    const parsed = parsePlanGrid(grid, '2026')!
    const february = parsed.entries.filter((e) => e.month === 2)
    expect(february.find((e) => e.name === 'Beispiel Trockenbau')?.isSub).toBe(true)
  })

  it('takes the month from a date header', () => {
    const grid: Grid = [
      [new Date(Date.UTC(2026, 2, 1)), null],
      ['Baustelle', 'Planumsatz netto'],
      ['Musterbau', 1000],
      ['Geplanter Umsatz', 1000],
    ]
    const parsed = parsePlanGrid(grid, 'Plan')!
    expect(parsed.year).toBe(2026)
    expect(parsed.entries[0].month).toBe(3)
  })

  it('reads the parked list for the following year', () => {
    const grid: Grid = [
      ['Monat Januar', null, null, 'Baustellen für 2027', null],
      ['Baustelle', 'Planumsatz netto', null, null, null],
      ['Musterbau', 1000, null, 'Beispielhalle', 60000],
      ['Geplanter Umsatz', 1000, null, 'geplant für 2027', 60000],
    ]
    const parsed = parsePlanGrid(grid, '2026')!
    const parked = parsed.entries.filter((e) => e.month === null)
    expect(parked).toEqual([
      { year: 2027, month: null, name: 'Beispielhalle', amount: 60000, isSub: false },
    ])
    expect(planTotals(parsed.entries, 2027).open).toBe(60000)
  })

  it('drops a month block whose caption cannot be read', () => {
    // No month above the header — better nothing than a wrong month.
    const grid: Grid = [
      ['Baustelle', 'Planumsatz netto'],
      ['Musterbau', 1000],
      ['Geplanter Umsatz', 1000],
    ]
    expect(parsePlanGrid(grid, '2026')).toBeNull()
  })

  it('skips a sheet without month blocks', () => {
    const grid: Grid = [['Putzer', 'Maler'], ['Musterputz GmbH', 'Beispiel Malerei']]
    expect(parsePlanGrid(grid, 'Subunternehmer')).toBeNull()
  })

  it('lets the sheet that owns a month win over a spill-over column', () => {
    const spillOver = parsePlanGrid(
      [
        ['Monat Januar 2027', null],
        ['Baustelle', 'Planumsatz netto'],
        ['Alter Wert', 111],
        ['Geplanter Umsatz', 111],
      ],
      '2026'
    )!
    const ownSheet = parsePlanGrid(
      [
        ['Monat Januar', null],
        ['Baustelle', 'Planumsatz netto'],
        ['Neuer Wert', 222],
        ['Geplanter Umsatz', 222],
      ],
      '2027'
    )!

    const merged = mergePlanSheets([spillOver, ownSheet])
    expect(merged.map((e) => e.name)).toEqual(['Neuer Wert'])
    expect(planTotals(merged, 2027).months[0].total).toBe(222)
  })

  it('keeps months of different years apart', () => {
    expect(bucketKey(2026, 1)).not.toBe(bucketKey(2027, 1))
    expect(bucketKey(2026, null)).toBe('2026-open')
  })

  it('ignores a note without a number', () => {
    const grid: Grid = [
      ['Monat Januar', null],
      ['Baustelle', 'Planumsatz netto'],
      ['Musterbau', 1000],
      ['noch offen, Termin fehlt', null],
      ['Geplanter Umsatz', 1000],
    ]
    expect(parsePlanGrid(grid, '2026')!.entries).toHaveLength(1)
  })

  it('reads German amounts written as text', () => {
    const grid: Grid = [
      ['Monat Januar', null],
      ['Baustelle', 'Planumsatz netto'],
      ['Musterbau', '12.500,50 €'],
      ['Geplanter Umsatz', null],
    ]
    expect(parsePlanGrid(grid, '2026')!.entries[0].amount).toBe(12500.5)
  })
})
