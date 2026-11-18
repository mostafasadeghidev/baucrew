import { describe, expect, it } from 'vitest'
import { boardBaseOf, cardHref, cardIdOf, cardPath, cardReturnTo, isCardPath } from '@/lib/card-url'

describe('cardPath', () => {
  it('names the card route', () => {
    expect(cardPath('p1')).toBe('/projects/card/p1')
  })
})

describe('isCardPath', () => {
  it('knows its own route, with and without context', () => {
    expect(isCardPath('/projects/card/p1')).toBe(true)
    expect(isCardPath('/projects/card/p1?view=kanban&board=b1')).toBe(true)
  })

  it('leaves the full page, the board and the sub-routes alone', () => {
    expect(isCardPath('/projects/p1')).toBe(false)
    expect(isCardPath('/projects/p1/edit')).toBe(false)
    expect(isCardPath('/projects')).toBe(false)
    expect(isCardPath('/projects?card=p1')).toBe(false)
    expect(isCardPath('/projects/new')).toBe(false)
  })
})

describe('cardHref', () => {
  it('carries the board context along and leaves the sheet params out', () => {
    const ctx = new URLSearchParams('view=kanban&board=b1&year=2026&q=maler&card=old&template=t1')
    expect(cardHref(ctx, 'p1')).toBe('/projects/card/p1?view=kanban&board=b1&year=2026&q=maler')
  })

  it('opens a quick editor window when asked to', () => {
    const ctx = new URLSearchParams('view=kanban&board=b1')
    expect(cardHref(ctx, 'p1', 'labels')).toBe('/projects/card/p1?view=kanban&board=b1&pop=labels')
  })

  it('stands without context', () => {
    expect(cardHref(new URLSearchParams(), 'p1')).toBe('/projects/card/p1')
  })
})

describe('cardReturnTo', () => {
  it('returns to the board with the card open, the pop answered once', () => {
    const ctx = new URLSearchParams('view=kanban&board=b1&year=2026&pop=dates')
    expect(cardReturnTo(ctx, 'p1')).toBe('/projects?view=kanban&board=b1&year=2026&card=p1')
  })

  it('keeps list context: page, status and filters', () => {
    const ctx = new URLSearchParams('view=list&status=APPROVED&page=2&member=me&urgent=1')
    expect(cardReturnTo(ctx, 'p1')).toBe('/projects?view=list&status=APPROVED&page=2&member=me&urgent=1&card=p1')
  })
})

describe('a card over Baustellen', () => {
  it('lives at /sites/card/<id> and returns to /sites', () => {
    expect(cardPath('p1', '/sites')).toBe('/sites/card/p1')
    expect(isCardPath('/sites/card/p1')).toBe(true)
    expect(isCardPath('/sites')).toBe(false)
    expect(cardHref(new URLSearchParams('q=maler&card=p0'), 'p1', undefined, '/sites')).toBe('/sites/card/p1?q=maler')
    expect(cardReturnTo(new URLSearchParams('view=list'), 'p1', '/sites')).toBe('/sites?view=list&card=p1')
  })

  it('tells the page by its address', () => {
    expect(boardBaseOf('/sites')).toBe('/sites')
    expect(boardBaseOf('/sites/card/p1')).toBe('/sites')
    expect(boardBaseOf('/sitesx')).toBe('/projects')
    expect(boardBaseOf('/projects/card/p1')).toBe('/projects')
    expect(boardBaseOf('/dashboard')).toBe('/projects')
  })

  it('reads the card’s id off either page’s card address', () => {
    expect(cardIdOf('/projects/card/p1?board=b1')).toBe('p1')
    expect(cardIdOf('/sites/card/p2')).toBe('p2')
    expect(cardIdOf('/projects/p1')).toBeNull()
  })
})
