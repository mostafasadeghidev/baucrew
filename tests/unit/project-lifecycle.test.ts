import { describe, expect, it } from 'vitest'
import {
  derivedActualDates,
  statusAfterFirstScheduleEntry,
  statusWhenFirstDayArrives,
} from '@/lib/project-lifecycle-rules'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe('statusAfterFirstScheduleEntry', () => {
  it('promotes preparation statuses to PLANNED', () => {
    expect(statusAfterFirstScheduleEntry('LEAD')).toBe('PLANNED')
    expect(statusAfterFirstScheduleEntry('QUOTED')).toBe('PLANNED')
    expect(statusAfterFirstScheduleEntry('APPROVED')).toBe('PLANNED')
  })
  it('never moves backwards', () => {
    for (const s of ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'] as const) {
      expect(statusAfterFirstScheduleEntry(s)).toBeNull()
    }
  })
})

describe('statusWhenFirstDayArrives', () => {
  it('starts a PLANNED project on its first scheduled day', () => {
    expect(statusWhenFirstDayArrives('PLANNED', d('2026-08-10'), d('2026-08-10'))).toBe('IN_PROGRESS')
    expect(statusWhenFirstDayArrives('PLANNED', d('2026-08-01'), d('2026-08-10'))).toBe('IN_PROGRESS')
  })
  it('does nothing before the day, without entries, or for other statuses', () => {
    expect(statusWhenFirstDayArrives('PLANNED', d('2026-08-11'), d('2026-08-10'))).toBeNull()
    expect(statusWhenFirstDayArrives('PLANNED', null, d('2026-08-10'))).toBeNull()
    expect(statusWhenFirstDayArrives('APPROVED', d('2026-08-01'), d('2026-08-10'))).toBeNull()
    expect(statusWhenFirstDayArrives('COMPLETED', d('2026-08-01'), d('2026-08-10'))).toBeNull()
  })
})

describe('derivedActualDates', () => {
  it('fills actualStart when work starts and actualEnd when finished', () => {
    const r = derivedActualDates({
      newStatus: 'COMPLETED',
      actualStart: null,
      actualEnd: null,
      firstEntryDate: d('2026-08-03'),
      lastEntryDateUpToToday: d('2026-08-07'),
      today: d('2026-08-10'),
    })
    expect(r.actualStart).toEqual(d('2026-08-03'))
    expect(r.actualEnd).toEqual(d('2026-08-07'))
  })
  it('falls back to today without schedule entries', () => {
    const r = derivedActualDates({
      newStatus: 'IN_PROGRESS',
      actualStart: null,
      actualEnd: null,
      firstEntryDate: null,
      lastEntryDateUpToToday: null,
      today: d('2026-08-10'),
    })
    expect(r.actualStart).toEqual(d('2026-08-10'))
    expect(r.actualEnd).toBeUndefined()
  })
  it('never overwrites dates that were entered by hand', () => {
    const r = derivedActualDates({
      newStatus: 'PAID',
      actualStart: d('2026-07-01'),
      actualEnd: d('2026-07-05'),
      firstEntryDate: d('2026-08-03'),
      lastEntryDateUpToToday: d('2026-08-07'),
      today: d('2026-08-10'),
    })
    expect(r).toEqual({})
  })
})
