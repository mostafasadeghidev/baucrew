import { describe, expect, it } from 'vitest'
import { expandDateRange, isWeekendIso } from '@/lib/schedule-range'
import { DEFAULT_PREP_TAB, parsePrepTabConfig, prepTabConfigFromForm, serializePrepTabConfig } from '@/lib/prep-tab'

describe('expandDateRange', () => {
  it('single day without end', () => {
    expect(expandDateRange('2026-08-17', null, true)).toEqual({ dates: ['2026-08-17'] })
    expect(expandDateRange('2026-08-17', '2026-08-17', true)).toEqual({ dates: ['2026-08-17'] })
  })
  it('Mon–Fri plus following Monday, skipping the weekend', () => {
    // 2026-08-17 is a Monday
    const r = expandDateRange('2026-08-17', '2026-08-24', true)
    expect(r.error).toBeUndefined()
    expect(r.dates).toEqual(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-24'])
  })
  it('keeps weekend days when not skipping', () => {
    expect(expandDateRange('2026-08-21', '2026-08-23', false).dates).toEqual(['2026-08-21', '2026-08-22', '2026-08-23'])
  })
  it('rejects backwards, too long, weekend-only ranges', () => {
    expect(expandDateRange('2026-08-20', '2026-08-19', true).error).toBe('invalidRange')
    expect(expandDateRange('2026-08-01', '2026-09-15', true).error).toBe('rangeTooLong')
    expect(expandDateRange('2026-08-22', '2026-08-23', true).error).toBe('noWorkingDays')
    expect(expandDateRange('bad', null, true).error).toBe('invalidRange')
  })
  it('isWeekendIso', () => {
    expect(isWeekendIso('2026-08-22')).toBe(true) // Sa
    expect(isWeekendIso('2026-08-23')).toBe(true) // So
    expect(isWeekendIso('2026-08-24')).toBe(false)
  })
})

describe('prep tab config', () => {
  it('defaults on empty / invalid JSON', () => {
    expect(parsePrepTabConfig(null)).toEqual(DEFAULT_PREP_TAB)
    expect(parsePrepTabConfig('{oops')).toEqual(DEFAULT_PREP_TAB)
    expect(parsePrepTabConfig('42')).toEqual(DEFAULT_PREP_TAB)
  })
  it('round-trips and filters unknown statuses', () => {
    const raw = serializePrepTabConfig({ enabled: false, label: 'Zur Vorbereitung', statuses: ['LEAD', 'PLANNED'], unscheduledOnly: true })
    expect(parsePrepTabConfig(raw)).toEqual({ enabled: false, label: 'Zur Vorbereitung', statuses: ['LEAD', 'PLANNED'], unscheduledOnly: true })
    expect(parsePrepTabConfig('{"statuses":["NOPE","QUOTED","QUOTED"]}').statuses).toEqual(['QUOTED'])
    expect(parsePrepTabConfig('{"statuses":["NOPE"]}').statuses).toEqual(DEFAULT_PREP_TAB.statuses)
  })
  it('reads the settings form', () => {
    const data = new Map<string, string>([
      ['enabled', 'on'],
      ['label', '  Offen  '],
      ['status_LEAD', 'on'],
      ['status_APPROVED', 'on'],
      ['unscheduledOnly', 'on'],
    ])
    expect(prepTabConfigFromForm((n) => data.get(n) ?? null)).toEqual({
      enabled: true,
      label: 'Offen',
      statuses: ['LEAD', 'APPROVED'],
      unscheduledOnly: true,
    })
    // no status ticked → defaults, so the tab never becomes empty by accident
    expect(prepTabConfigFromForm(() => null).statuses).toEqual(DEFAULT_PREP_TAB.statuses)
  })
})
