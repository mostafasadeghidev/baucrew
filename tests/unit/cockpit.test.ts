import { describe, expect, it } from 'vitest'
import { lampAbove, overdueOf, siteGroupOf, siteProgress, stageRows } from '@/lib/cockpit'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
// A Friday.
const today = d('2026-09-11')

describe('lampAbove', () => {
  it('is green with none of it, yellow with some, red with a lot', () => {
    expect(lampAbove(0, 1, 5)).toBe('green')
    expect(lampAbove(3, 1, 5)).toBe('yellow')
    expect(lampAbove(5, 1, 5)).toBe('red')
  })
})

describe('stageRows', () => {
  const p = (status: string, amount: number | null, historical = false) => ({ status, amount, historical })

  it('adds up what still matters today, in the order the work runs, with the jobs that have no value', () => {
    const { rows } = stageRows([
      p('IN_PROGRESS', 30_000),
      p('APPROVED', 10_000),
      p('APPROVED', null),
      p('COMPLETED', 8_000),
    ])
    expect(rows).toEqual([
      { stage: 'LEAD', count: 0, total: 0, withoutValue: 0 },
      { stage: 'QUOTED', count: 0, total: 0, withoutValue: 0 },
      { stage: 'APPROVED', count: 2, total: 10_000, withoutValue: 1 },
      { stage: 'IN_PROGRESS', count: 1, total: 30_000, withoutValue: 0 },
      { stage: 'COMPLETED', count: 1, total: 8_000, withoutValue: 0 },
    ])
  })

  it('leaves old data, paid and cancelled work out of the rows and counts them in the footer', () => {
    const { rows, footer } = stageRows([
      p('COMPLETED', 3_000_000, true),
      p('INVOICED', 212_000, true),
      p('PAID', 9_000),
      p('CANCELLED', 99_000),
    ])
    expect(rows.map((r) => r.stage)).toEqual(['LEAD', 'QUOTED'])
    expect(footer).toEqual({ historicalCount: 2, historicalTotal: 3_212_000, paidCount: 1, cancelledCount: 1 })
  })
})

describe('overdueOf', () => {
  const job = (status: string, start: string | null, end: string | null) => ({
    status,
    plannedStart: start ? d(start) : null,
    plannedEnd: end ? d(end) : null,
  })

  it('names ordered work whose planned end has passed, in working days', () => {
    // Due Friday 4 September: Monday 7 to Friday 11 are five working days.
    expect(overdueOf(job('IN_PROGRESS', '2026-08-24', '2026-09-04'), today)).toEqual({ reason: 'end', workdaysLate: 5 })
  })

  it('names ordered work whose start has passed and that never began', () => {
    expect(overdueOf(job('APPROVED', '2026-09-07', '2026-09-30'), today)).toEqual({ reason: 'start', workdaysLate: 4 })
    // Running within its dates is not late.
    expect(overdueOf(job('IN_PROGRESS', '2026-09-07', '2026-09-30'), today)).toBeNull()
  })

  it('never calls an enquiry or an offer late, nor work on its last day, nor work with no date', () => {
    expect(overdueOf(job('QUOTED', '2026-08-01', '2026-08-10'), today)).toBeNull()
    expect(overdueOf(job('IN_PROGRESS', '2026-09-01', '2026-09-11'), today)).toBeNull()
    expect(overdueOf(job('PLANNED', null, null), today)).toBeNull()
  })

  it('counts at least one working day for a job that passed its date over a weekend', () => {
    const sunday = d('2026-09-13')
    expect(overdueOf(job('IN_PROGRESS', '2026-09-01', '2026-09-12'), sunday)).toEqual({ reason: 'end', workdaysLate: 1 })
  })
})

describe('siteGroupOf', () => {
  const job = (status: string, start: string | null, end: string | null) => ({
    status,
    plannedStart: start ? d(start) : null,
    plannedEnd: end ? d(end) : null,
  })

  it('puts every job in exactly one group: late, running, or starting soon', () => {
    expect(siteGroupOf(job('IN_PROGRESS', '2026-08-01', '2026-09-01'), today)).toBe('overdue')
    expect(siteGroupOf(job('IN_PROGRESS', '2026-09-01', '2026-09-30'), today)).toBe('running')
    expect(siteGroupOf(job('IN_PROGRESS', null, null), today)).toBe('running')
    expect(siteGroupOf(job('PLANNED', '2026-09-25', '2026-10-09'), today)).toBe('starting')
  })

  it('leaves out what starts later than two weeks, and enquiries and offers', () => {
    expect(siteGroupOf(job('APPROVED', '2026-10-15', '2026-10-30'), today)).toBeNull()
    expect(siteGroupOf(job('QUOTED', '2026-09-14', '2026-09-20'), today)).toBeNull()
    expect(siteGroupOf(job('COMPLETED', '2026-09-01', '2026-09-05'), today)).toBeNull()
  })
})

describe('siteProgress', () => {
  it('counts the working days of the plan that are behind us', () => {
    // 1–18 September 2026: 14 weekdays, of which 1–11 are 9.
    expect(siteProgress(d('2026-09-01'), d('2026-09-18'), today)).toEqual({ plannedDays: 14, doneDays: 9, pct: 64 })
  })

  it('is nothing before the site starts, and never more than the whole plan', () => {
    expect(siteProgress(d('2026-10-01'), d('2026-10-09'), today)).toMatchObject({ doneDays: 0, pct: 0 })
    expect(siteProgress(d('2026-07-01'), d('2026-07-10'), today)).toMatchObject({ pct: 100 })
  })

  it('has nothing to say without a planned start', () => {
    expect(siteProgress(null, d('2026-09-18'), today)).toEqual({ plannedDays: null, doneDays: null, pct: null })
  })
})
