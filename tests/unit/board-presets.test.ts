import { describe, expect, it } from 'vitest'
import { boardPreset, presetIsSound, sitesPreset } from '@/lib/board-presets'

describe('the sites board preset', () => {
  it('is the ten lists of the Trello board, three of them by a rule', () => {
    const preset = sitesPreset(2026)
    expect(preset.columns).toHaveLength(10)
    expect(preset.columns.filter((c) => c.rule).map((c) => c.rule)).toEqual(['nextYear', 'lowPriority', 'paused', 'invoice1'])
    expect(preset.columns.map((c) => c.status)).toEqual([
      'APPROVED',
      'APPROVED',
      'APPROVED',
      'PLANNED',
      'IN_PROGRESS',
      'IN_PROGRESS',
      'IN_PROGRESS',
      'COMPLETED',
      'INVOICED',
      'PAID',
    ])
  })

  it('names next year as the list did', () => {
    expect(sitesPreset(2026).columns[1].title).toBe('Aufträge für 2027')
  })

  it('is sound: every rule on its own status, every title within the limit', () => {
    expect(presetIsSound(sitesPreset(2026))).toBe(true)
    expect(presetIsSound({ ...sitesPreset(2026), columns: [{ status: 'PAID', rule: 'paused', title: 'x' }] })).toBe(false)
  })

  it('is found by its key and nothing else is', () => {
    expect(boardPreset('sites', 2026)?.name).toBe('Aktuell laufende Baustellen')
    expect(boardPreset('other', 2026)).toBeNull()
  })
})
