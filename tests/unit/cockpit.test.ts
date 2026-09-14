import { describe, expect, it } from 'vitest'
import {
  crewDays,
  lampAbove,
  overdueOf,
  siteGroupOf,
  siteProgress,
  sitesToday,
  stageRows,
  todayCrewLamp,
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
  it('lists every day of the span with its people, each once a day and never on a day away', () => {
    const bookings = [
      { employeeId: 'm1', date: d('2026-09-14') },
      { employeeId: 'm1', date: d('2026-09-14') }, // a second site the same day
      { employeeId: 'm2', date: d('2026-09-14') },
      { employeeId: 'm2', date: d('2026-09-15') }, // away that day
      { employeeId: 'm1', date: d('2026-09-19') }, // a Saturday on site
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
      ['2026-09-19', 1],
      ['2026-09-20', 0],
    ])
  })
})

describe('usualCrew', () => {
  const day = (date: string, people: number) => ({ date: d(date), people })

  it('reads the usual crew from the working days anybody worked, not from empty days or weekends', () => {
    // Monday 3 to Wednesday 5 August 2026, and Saturday the 8th.
    expect(usualCrew([day('2026-08-03', 6), day('2026-08-04', 7), day('2026-08-05', 0), day('2026-08-08', 2)])).toBe(6.5)
    expect(usualCrew([day('2026-08-03', 6), day('2026-08-04', 7), day('2026-08-06', 7)])).toBe(6.7)
    expect(usualCrew([day('2026-08-05', 0), day('2026-08-08', 2)])).toBeNull()
  })
})

describe('sitesToday', () => {
  const entry = (projectId: string, people: string[]) => ({
    projectId,
    project: { number: `2041-${projectId}`, name: `Musterbaustelle ${projectId}` },
    employees: people.map((id) => ({ employeeId: id, employee: { firstName: 'Muster', lastName: id } })),
  })

  it('lists every site with its people, the fullest first, and counts a person on two sites once', () => {
    const { sites, people } = sitesToday([entry('a', ['Eins']), entry('b', ['Eins', 'Zwei', 'Drei'])], new Set())
    expect(sites.map((site) => [site.projectId, site.people])).toEqual([
      ['b', ['Muster Eins', 'Muster Zwei', 'Muster Drei']],
      ['a', ['Muster Eins']],
    ])
    expect(people).toBe(3)
  })

  it('names who is booked but away apart, and does not count them', () => {
    const { sites, people } = sitesToday([entry('a', ['Eins', 'Zwei']), entry('b', ['Zwei'])], new Set(['Zwei']))
    expect(sites[0]).toMatchObject({ projectId: 'a', people: ['Muster Eins'], away: ['Muster Zwei'] })
    expect(sites[1]).toMatchObject({ projectId: 'b', people: [], away: ['Muster Zwei'] })
    expect(people).toBe(1)
  })

  it('has no site and nobody on a day without a schedule', () => {
    expect(sitesToday([], new Set())).toEqual({ sites: [], people: 0 })
  })
})

describe('todayCrewLamp', () => {
  // Monday 14 and Saturday 19 September 2026.
  const monday = (people: number) => ({ date: d('2026-09-14'), people })

  it('has nothing to judge on a weekend, whoever works', () => {
    expect(todayCrewLamp({ date: d('2026-09-19'), people: 0 }, 7)).toBe('none')
    expect(todayCrewLamp({ date: d('2026-09-19'), people: 3 }, 7)).toBe('none')
  })

  it('warns on a working day with nobody on site, or with a quarter of the usual crew or more without a site', () => {
    expect(todayCrewLamp(monday(0), 7)).toBe('yellow')
    expect(todayCrewLamp(monday(5), 7)).toBe('yellow')
    expect(todayCrewLamp(monday(6), 7)).toBe('green')
  })

  it('is green with anybody on site and nothing usual to hold it against', () => {
    expect(todayCrewLamp(monday(2), null)).toBe('green')
    expect(todayCrewLamp(monday(0), null)).toBe('yellow')
  })
})
