import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LAYOUT,
  moveWidget,
  parseLayout,
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
    const moved = moveWidget(start, 'today', -1)
    expect(moved.map((w) => w.id).indexOf('today')).toBe(DEFAULT_LAYOUT.length - 2)
    // first widget cannot move further up
    expect(moveWidget(start, 'stats', -1)).toBe(start)
    expect(toggleHidden(start, 'weather').find((w) => w.id === 'weather')?.hidden).toBe(true)
    expect(toggleWidth(start, 'stats').find((w) => w.id === 'stats')?.width).toBe('half')
  })
})
