import { describe, expect, it } from 'vitest'
import { isSheetDate, isSheetPrice, planNote, sheetFigures, withoutPlanNotes } from '@/lib/plan-notes'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe('the plan note', () => {
  const note = planNote('2026-09-06', { start: d('2026-03-01'), end: d('2026-05-31'), price: 12500.5 })

  it('says what was taken and reads back the same', () => {
    expect(note).toBe(
      'Abgleich mit der Jahresplanung 2026-09-06: Start 2026-03-01, Ende 2026-05-31, Auftragswert 12.500,5 € aus der Tabelle übernommen.'
    )
    expect(sheetFigures(`Kunde will alles neu.\n\n${note}`)).toEqual({
      start: '2026-03-01',
      end: '2026-05-31',
      price: 12500.5,
    })
  })

  it('takes the latest note for each figure', () => {
    const later = planNote('2026-09-07', { end: d('2026-08-31'), price: 40000 })
    expect(sheetFigures(`${note}\n\n${later}`)).toEqual({
      start: '2026-03-01',
      end: '2026-08-31',
      price: 40000,
    })
  })

  it('reads the notes after the project form saved them with Windows line ends', () => {
    const saved = `Kunde will alles neu.\r\n\r\n${note}\r\n`
    expect(sheetFigures(saved).price).toBe(12500.5)
    expect(withoutPlanNotes(saved)).toBe('Kunde will alles neu.')
  })

  it('tells a sheet figure from one the office typed', () => {
    const figures = sheetFigures(note)
    expect(isSheetDate(figures.start, d('2026-03-01'))).toBe(true)
    expect(isSheetDate(figures.start, d('2026-03-02'))).toBe(false)
    expect(isSheetDate(figures.start, null)).toBe(false)
    expect(isSheetDate(null, d('2026-03-01'))).toBe(false)
    expect(isSheetPrice(figures.price, 12500.5)).toBe(true)
    expect(isSheetPrice(figures.price, 12500)).toBe(false)
  })

  it('comes out of the description without a trace', () => {
    expect(withoutPlanNotes(`Kunde will alles neu.\n\n${note}`)).toBe('Kunde will alles neu.')
    expect(withoutPlanNotes(note)).toBeNull()
    expect(withoutPlanNotes(null)).toBeNull()
  })
})
