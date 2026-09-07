import { describe, expect, it } from 'vitest'
import { formatHistoryCutoff, isHistorical, parseHistoryCutoff, projectHistoryDate, type HistoryProject } from '@/lib/history'

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)
const project = (over: Partial<HistoryProject> = {}): HistoryProject => ({
  status: 'COMPLETED',
  plannedStart: null,
  plannedEnd: null,
  actualStart: null,
  actualEnd: null,
  sourceCreatedAt: null,
  ...over,
})
const CUTOFF = day('2026-09-01')

describe('the day a project is filed under', () => {
  it('takes the end it really had before the one it was meant to have', () => {
    expect(projectHistoryDate(project({ actualEnd: day('2025-06-30'), plannedEnd: day('2025-05-31') }))).toEqual(day('2025-06-30'))
    expect(projectHistoryDate(project({ plannedEnd: day('2025-05-31'), plannedStart: day('2025-03-01') }))).toEqual(day('2025-05-31'))
    expect(projectHistoryDate(project({ actualStart: day('2025-02-01'), plannedStart: day('2025-03-01') }))).toEqual(day('2025-02-01'))
    expect(projectHistoryDate(project({ plannedStart: day('2025-03-01') }))).toEqual(day('2025-03-01'))
    expect(projectHistoryDate(project({ sourceCreatedAt: day('2025-01-15') }))).toEqual(day('2025-01-15'))
    expect(projectHistoryDate(project())).toBeNull()
  })
})

describe('what counts as history', () => {
  it('is finished work from before the cutoff', () => {
    expect(isHistorical(project({ actualEnd: day('2025-06-30') }), CUTOFF)).toBe(true)
    expect(isHistorical(project({ sourceCreatedAt: day('2025-01-15') }), CUTOFF)).toBe(true)
  })

  it('is not work that is still open, however old', () => {
    for (const status of ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS']) {
      expect(isHistorical(project({ status, sourceCreatedAt: day('2023-01-01') }), CUTOFF)).toBe(false)
    }
  })

  it('is not work finished on or after the cutoff', () => {
    expect(isHistorical(project({ actualEnd: day('2026-09-01') }), CUTOFF)).toBe(false)
    expect(isHistorical(project({ actualEnd: day('2026-10-05') }), CUTOFF)).toBe(false)
  })

  it('is not a finished project nobody can date', () => {
    expect(isHistorical(project(), CUTOFF)).toBe(false)
  })

  it('is nothing at all while no cutoff is set', () => {
    expect(isHistorical(project({ actualEnd: day('2019-01-01') }), null)).toBe(false)
  })
})

describe('the setting', () => {
  it('reads a plain date and refuses anything else', () => {
    expect(parseHistoryCutoff('2026-09-01')).toEqual(day('2026-09-01'))
    expect(parseHistoryCutoff('')).toBeNull()
    expect(parseHistoryCutoff(null)).toBeNull()
    expect(parseHistoryCutoff('01.09.2026')).toBeNull()
    expect(parseHistoryCutoff('2026-13-45')).toBeNull()
  })

  it('refuses a day the calendar does not have, instead of rolling it over', () => {
    expect(parseHistoryCutoff('2026-02-31')).toBeNull()
    expect(parseHistoryCutoff('2026-04-31')).toBeNull()
    expect(parseHistoryCutoff('2024-02-29')).toEqual(day('2024-02-29'))
  })

  it('counts every finished status as finished', () => {
    for (const status of ['COMPLETED', 'INVOICED', 'PAID']) {
      expect(isHistorical(project({ status, actualEnd: day('2025-06-30') }), CUTOFF)).toBe(true)
    }
  })

  it('writes back what it read', () => {
    expect(formatHistoryCutoff(parseHistoryCutoff('2026-09-01'))).toBe('2026-09-01')
    expect(formatHistoryCutoff(null)).toBe('')
  })
})
