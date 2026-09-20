import { describe, expect, it } from 'vitest'
import { narrowedStatuses, opensBoard, projectsViewHref } from '@/lib/projects-view'

describe('opensBoard', () => {
  it('opens the board when nothing says otherwise, and with a search', () => {
    expect(opensBoard({})).toBe(true)
    expect(opensBoard({ view: '' })).toBe(true)
  })

  it('opens the list when it is asked for by name', () => {
    expect(opensBoard({ view: 'list' })).toBe(false)
    expect(opensBoard({ view: 'list', status: 'PLANNED', page: '2' })).toBe(false)
  })

  it('opens the list for a status tab or a page number, which only the list has', () => {
    expect(opensBoard({ status: 'IN_PROGRESS' })).toBe(false)
    expect(opensBoard({ status: 'prep' })).toBe(false)
    expect(opensBoard({ page: '3' })).toBe(false)
  })

  it('keeps an old board bookmark on the board', () => {
    expect(opensBoard({ view: 'kanban' })).toBe(true)
    expect(opensBoard({ view: 'kanban', status: 'PLANNED' })).toBe(true)
  })
})

describe('projectsViewHref', () => {
  it('keeps the search and the year when switching between list and board', () => {
    expect(projectsViewHref('list', { q: 'Muster GmbH', year: '2025' })).toBe('/projects?view=list&q=Muster+GmbH&year=2025')
    expect(projectsViewHref('board', { q: 'Muster', year: 'all' })).toBe('/projects?q=Muster&year=all')
  })

  it('takes the filters along, both ways', () => {
    const keep = { q: 'Muster', member: 'emp1', label: 'cat1', urgent: '1', board: 'b2' }
    expect(projectsViewHref('list', keep)).toBe('/projects?view=list&q=Muster&board=b2&member=emp1&label=cat1&urgent=1')
    expect(projectsViewHref('board', keep)).toBe('/projects?q=Muster&board=b2&member=emp1&label=cat1&urgent=1')
  })

  it('asks for the board by name when a status tab goes with it', () => {
    // A status alone opens the list; the board has to be named beside it.
    const href = projectsViewHref('board', { status: 'IN_PROGRESS', year: '2025' })
    expect(href).toBe('/projects?view=kanban&status=IN_PROGRESS&year=2025')
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams)
    expect(opensBoard(params)).toBe(true)
    expect(projectsViewHref('list', { status: 'prep' })).toBe('/projects?view=list&status=prep')
  })

  it('leads to the bare page when there is nothing to keep', () => {
    expect(projectsViewHref('board', {})).toBe('/projects')
    expect(projectsViewHref('list', { q: '', year: '' })).toBe('/projects?view=list')
  })
})

describe('narrowedStatuses', () => {
  const board = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS']

  it('leaves the columns the status tab holds, in the order of the board', () => {
    expect(narrowedStatuses(board, ['IN_PROGRESS'])).toEqual(['IN_PROGRESS'])
    expect(narrowedStatuses(board, ['APPROVED', 'LEAD'])).toEqual(['LEAD', 'APPROVED'])
  })

  it('shows the board whole without a tab, or when it has no such column', () => {
    expect(narrowedStatuses(board, null)).toBeNull()
    expect(narrowedStatuses(board, ['PAID'])).toBeNull()
  })
})
