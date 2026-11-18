import { describe, expect, it } from 'vitest'
import { needsNextDate, siteFlags } from '@/lib/sites'

const day = (d: number) => new Date(Date.UTC(2026, 8, d))

const counts = { overdueTasks: 0, overdueDefects: 0, openForms: 0 }

describe('what a site is flagged for', () => {
  it('is nothing on a tidy running site with a crew and a next day', () => {
    expect(siteFlags({ status: 'IN_PROGRESS', crew: 2, nextDate: day(23), counts })).toEqual([])
  })

  it('is overdue work first, then the unsigned form, then crew and planning', () => {
    expect(
      siteFlags({
        status: 'IN_PROGRESS',
        crew: 0,
        nextDate: null,
        counts: { overdueTasks: 1, overdueDefects: 2, openForms: 1 },
      })
    ).toEqual(['overdueDefects', 'overdueTasks', 'openForms', 'noCrew', 'noAssignment'])
  })

  it('does not ask a site that has not started for a crew or a day yet', () => {
    expect(siteFlags({ status: 'PLANNED', crew: 0, nextDate: null, counts })).toEqual([])
  })

  it('still names overdue work and open forms on a card that is not running', () => {
    expect(siteFlags({ status: 'COMPLETED', crew: 0, nextDate: null, counts: { ...counts, overdueTasks: 1, openForms: 2 } })).toEqual([
      'overdueTasks',
      'openForms',
    ])
  })
})

describe('which sites the schedule is asked about', () => {
  it('is the running ones only', () => {
    expect(
      needsNextDate([
        { id: 'a', status: 'IN_PROGRESS' },
        { id: 'b', status: 'PLANNED' },
        { id: 'c', status: 'IN_PROGRESS' },
        { id: 'd', status: 'COMPLETED' },
      ])
    ).toEqual(['a', 'c'])
  })
})
