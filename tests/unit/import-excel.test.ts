import { describe, expect, it } from 'vitest'
import { mapRow, normalizeDate, normalizePrice } from '@/lib/import-excel'

describe('excel import', () => {
  it('reads German prices', () => {
    expect(normalizePrice('50.000,00 €')).toBe(50000)
    expect(normalizePrice('1.234,56')).toBe(1234.56)
    expect(normalizePrice('5000')).toBe(5000)
    expect(normalizePrice(5000)).toBe(5000)
    expect(normalizePrice('n/a')).toBeNull()
  })

  it('reads German and ISO dates', () => {
    expect(normalizeDate('24.12.2026')?.toISOString()).toBe('2026-12-24T00:00:00.000Z')
    expect(normalizeDate('2026-12-24')?.toISOString()).toBe('2026-12-24T00:00:00.000Z')
    expect(normalizeDate('1.3.26')?.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(normalizeDate('soon')).toBeNull()
  })

  it('maps a row by header names and refuses rows without a name', () => {
    const headers = ['Baustelle', 'Kunde', 'Auftragswert', 'Start']
    const mapping = { name: 'Baustelle', customerName: 'Kunde', price: 'Auftragswert', plannedStart: 'Start' }
    const draft = mapRow(headers, ['Musterweg 5', 'Muster GmbH', '12.500,00', '01.09.2026'], mapping)
    expect(draft).toMatchObject({ name: 'Musterweg 5', customerName: 'Muster GmbH', price: 12500 })
    expect(draft?.plannedStart?.toISOString().slice(0, 10)).toBe('2026-09-01')
    expect(mapRow(headers, ['', 'Muster GmbH', '1', ''], mapping)).toBeNull()
  })
})
