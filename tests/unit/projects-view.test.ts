import { describe, expect, it } from 'vitest'
import { opensBoard, projectsViewHref } from '@/lib/projects-view'

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

  it('leads to the bare page when there is nothing to keep', () => {
    expect(projectsViewHref('board', {})).toBe('/projects')
    expect(projectsViewHref('list', { q: '', year: '' })).toBe('/projects?view=list')
  })
})
