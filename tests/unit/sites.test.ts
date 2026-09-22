import { describe, expect, it } from 'vitest'
import { checklistProgress, countDue, siteFlags, sortSites } from '@/lib/sites'

const today = new Date(Date.UTC(2026, 8, 22))
const day = (d: number) => new Date(Date.UTC(2026, 8, d))

const counts = {
  openTasks: 0,
  overdueTasks: 0,
  openDefects: 0,
  overdueDefects: 0,
  photos: 0,
  openForms: 0,
  signedForms: 0,
  checklistDone: 0,
  checklistTotal: 0,
}

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
        counts: { ...counts, overdueTasks: 1, overdueDefects: 2, openForms: 1 },
      })
    ).toEqual(['overdueDefects', 'overdueTasks', 'openForms', 'noCrew', 'noAssignment'])
  })

  it('does not ask a site that has not started for a crew or a day yet', () => {
    expect(siteFlags({ status: 'PLANNED', crew: 0, nextDate: null, counts })).toEqual([])
  })
})

describe('the order of the sites', () => {
  it('is running sites by their next day, then the ones about to start, nothing planned last', () => {
    const rows = [
      { number: '2026-0001', status: 'PLANNED', nextDate: day(25) },
      { number: '2026-0002', status: 'IN_PROGRESS', nextDate: null },
      { number: '2026-0003', status: 'IN_PROGRESS', nextDate: day(24) },
      { number: '2026-0004', status: 'IN_PROGRESS', nextDate: day(22) },
      { number: '2026-0005', status: 'IN_PROGRESS', nextDate: null },
    ]
    expect(sortSites(rows).map((r) => r.number)).toEqual([
      '2026-0004',
      '2026-0003',
      '2026-0005',
      '2026-0002',
      '2026-0001',
    ])
  })

  it('leaves the given list alone', () => {
    const rows = [
      { number: '2026-0002', status: 'IN_PROGRESS', nextDate: null },
      { number: '2026-0001', status: 'IN_PROGRESS', nextDate: day(22) },
    ]
    sortSites(rows)
    expect(rows[0].number).toBe('2026-0002')
  })
})

describe('the counts', () => {
  it('tell open from overdue by the day, today itself not being overdue', () => {
    expect(countDue([{ dueDate: day(21) }, { dueDate: day(22) }, { dueDate: day(23) }, { dueDate: null }], today)).toEqual({
      open: 4,
      overdue: 1,
    })
  })

  it('add the checklists up', () => {
    expect(
      checklistProgress([
        { items: [{ checkedAt: day(20) }, { checkedAt: null }] },
        { items: [{ checkedAt: day(20) }] },
        { items: [] },
      ])
    ).toEqual({ done: 2, total: 3 })
  })
})
