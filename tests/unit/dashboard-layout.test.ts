import { describe, expect, it } from 'vitest'
import {
  allowedLayout,
  DEFAULT_LAYOUT,
  FINANCIAL_WIDGETS,
  moveWidget,
  parseLayout,
  reorderLayout,
  serializeLayout,
  toggleHidden,
  toggleWidth,
} from '@/lib/dashboard-layout'

describe('dashboard layout', () => {
  it('falls back to the default for empty or broken input', () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT)
    expect(parseLayout('{oops')).toEqual(DEFAULT_LAYOUT)
    expect(parseLayout('[]')).toEqual(DEFAULT_LAYOUT)
  })

  it('drops unknown widgets and appends new ones', () => {
    const stored = serializeLayout([
      { id: 'today', hidden: true, width: 'full' },
      // @ts-expect-error — a widget that no longer exists
      { id: 'gone', hidden: false, width: 'full' },
    ])
    const layout = parseLayout(stored)
    expect(layout[0]).toEqual({ id: 'today', hidden: true, width: 'full' })
    expect(layout.map((w) => w.id)).toContain('stats')
    expect(layout.map((w) => w.id)).not.toContain('gone')
    expect(layout).toHaveLength(DEFAULT_LAYOUT.length)
  })

  it('moves, hides and resizes', () => {
    const start = DEFAULT_LAYOUT.map((w) => ({ ...w }))
    const before = start.findIndex((w) => w.id === 'today')
    expect(moveWidget(start, 'today', -1).findIndex((w) => w.id === 'today')).toBe(before - 1)
    // first widget cannot move further up, last one not further down
    expect(moveWidget(start, 'stats', -1)).toBe(start)
    expect(moveWidget(start, start[start.length - 1].id, 1)).toBe(start)
    expect(toggleHidden(start, 'weather').find((w) => w.id === 'weather')?.hidden).toBe(true)
    expect(toggleWidth(start, 'stats').find((w) => w.id === 'stats')?.width).toBe('half')
  })

  it('applies a drag & drop order and keeps unknown or missing cards', () => {
    const start = DEFAULT_LAYOUT.map((w) => ({ ...w }))
    const dropped = reorderLayout(start, ['today', 'stats', 'nonsense'])
    expect(dropped.map((w) => w.id).slice(0, 2)).toEqual(['today', 'stats'])
    // nothing is lost: every card of the original layout is still there, once
    expect(dropped).toHaveLength(start.length)
    expect(new Set(dropped.map((w) => w.id)).size).toBe(start.length)
    // widths and hidden flags survive the move
    expect(dropped.find((w) => w.id === 'stats')?.width).toBe('full')
  })

  it('hides the money cards from accounts without financial access', () => {
    const start = DEFAULT_LAYOUT.map((w) => ({ ...w }))
    expect(allowedLayout(start, true)).toHaveLength(start.length)
    const limited = allowedLayout(start, false)
    expect(limited).toHaveLength(start.length - FINANCIAL_WIDGETS.length)
    for (const id of FINANCIAL_WIDGETS) expect(limited.map((w) => w.id)).not.toContain(id)
  })
})
