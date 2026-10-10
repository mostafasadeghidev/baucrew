import { describe, expect, it } from 'vitest'
import { boardViewHref, narrowedStatuses, opensBoard, projectsViewHref } from '@/lib/projects-view'

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
  it('retains completion and activity filters in both directions', () => {
    const keep = { q: 'Muster', year: '2026', board: 'board1', status: 'APPROVED', member: 'me', label: 'trade1', urgent: '1', due: 'week', done: '0', activity: 'stale' }
    for (const target of ['board', 'list'] as const) {
      const url = new URL(projectsViewHref(target, keep), 'http://localhost')
      for (const [key, value] of Object.entries(keep)) expect(url.searchParams.get(key)).toBe(value)
      expect(opensBoard(Object.fromEntries(url.searchParams))).toBe(target === 'board')
    }
  })
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

describe('boardViewHref', () => {
  it('preserves the view and shared filters but closes the previous board context', () => {
    const query = 'view=list&board=old&q=Muster&done=0&activity=stale&year=2026&page=3&status=LEAD&card=old-card&template=old-template&archived=1&aq=old&feed=100&pop=labels'
    const params = new URL(boardViewHref(query, 'new'), 'http://localhost').searchParams
    expect(Object.fromEntries(params)).toEqual({ view: 'list', board: 'new', q: 'Muster', done: '0', activity: 'stale', year: '2026' })
  })

  it('keeps the current presentation when opening any scope, including all projects', () => {
    expect(new URL(boardViewHref('page=2', 'board1'), 'http://localhost').searchParams.get('view')).toBe('kanban')
    const params = new URL(boardViewHref('view=kanban&done=1', 'all'), 'http://localhost').searchParams
    expect(Object.fromEntries(params)).toEqual({ view: 'kanban', done: '1', board: 'all' })
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
