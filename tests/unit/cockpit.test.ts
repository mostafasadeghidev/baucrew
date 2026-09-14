import { describe, expect, it } from 'vitest'
import {
  crewDays,
  crewLamp,
  crewSpan,
  lampAbove,
  overdueOf,
  siteGroupOf,
  siteProgress,
  stageRows,
  usualCrew,
} from '@/lib/cockpit'

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

describe('crewDays', () => {
  it('lists every weekday of the span with its people, each once a day and never on a day away', () => {
    const bookings = [
      { employeeId: 'm1', date: d('2026-09-14') },
      { employeeId: 'm1', date: d('2026-09-14') }, // a second site the same day
      { employeeId: 'm2', date: d('2026-09-14') },
      { employeeId: 'm2', date: d('2026-09-15') }, // away that day
      { employeeId: 'm1', date: d('2026-09-19') }, // a Saturday
      { employeeId: 'm1', date: d('2026-09-21') }, // after the span
    ]
    const away = [{ employeeId: 'm2', startDate: d('2026-09-15'), endDate: d('2026-09-16') }]
    const days = crewDays(bookings, away, d('2026-09-14'), d('2026-09-20'))
    expect(days.map((day) => [day.date.toISOString().slice(0, 10), day.people])).toEqual([
      ['2026-09-14', 2],
      ['2026-09-15', 0],
      ['2026-09-16', 0],
      ['2026-09-17', 0],
      ['2026-09-18', 0],
    ])
  })

  it('has no day on a weekend alone', () => {
    expect(crewDays([], [], d('2026-10-31'), d('2026-11-01'))).toEqual([])
  })
})

describe('crewSpan and usualCrew', () => {
  const day = (date: string, people: number) => ({ date: d(date), people })

  it('spreads the people over every weekday ahead, the empty ones included, to one decimal', () => {
    const span = crewSpan([day('2026-09-14', 7), day('2026-09-15', 7), day('2026-09-16', 0)])
    expect(span).toMatchObject({ perDay: 4.7, staffed: 2 })
    expect(crewSpan([])).toEqual({ days: [], perDay: null, staffed: 0 })
  })

  it('reads the usual crew from the days anybody worked, not from the empty ones', () => {
    expect(usualCrew([day('2026-08-03', 6), day('2026-08-04', 7), day('2026-08-05', 0)])).toBe(6.5)
    expect(usualCrew([day('2026-08-05', 0)])).toBeNull()
  })
})

describe('crewLamp', () => {
  const span = (...people: number[]) =>
    crewSpan(people.map((n, i) => ({ date: new Date(Date.UTC(2026, 8, 14 + i)), people: n })))

  it('has nothing to judge when no weekday is left', () => {
    expect(crewLamp(crewSpan([]), 7)).toBe('none')
  })

  it('warns of a day with nobody on it, or of less than three quarters of the usual crew', () => {
    expect(crewLamp(span(7, 0, 7), 7)).toBe('yellow')
    expect(crewLamp(span(5, 5, 5), 7)).toBe('yellow')
    expect(crewLamp(span(6, 6, 6), 7)).toBe('green')
  })

  it('is green with every day staffed and nothing usual to hold it against', () => {
    expect(crewLamp(span(2, 3), null)).toBe('green')
  })
})
