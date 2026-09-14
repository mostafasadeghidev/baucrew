import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REVENUE_LAYOUT,
  parseRevenueLayoutCookie,
  resolveRevenueLayout,
  revenueCardsDense,
  revenueDensity,
  revenueLayoutCookieValue,
  withDensity,
  type RevenueLayoutChoice,
} from '@/lib/revenue-layout'

describe('parseRevenueLayoutCookie', () => {
  it('reads back what was written', () => {
    const choice: RevenueLayoutChoice = { layout: 'matrix', grid: '6', lanes: '12', matrix: 'full' }
    expect(parseRevenueLayoutCookie(revenueLayoutCookieValue(choice))).toEqual(choice)
  })

  it('opens on the grid of three when nothing was chosen yet', () => {
    expect(parseRevenueLayoutCookie(undefined)).toEqual(DEFAULT_REVENUE_LAYOUT)
    expect(parseRevenueLayoutCookie(null)).toEqual(DEFAULT_REVENUE_LAYOUT)
    expect(parseRevenueLayoutCookie('')).toEqual(DEFAULT_REVENUE_LAYOUT)
  })

  it('keeps the fields it can read and replaces only the others', () => {
    expect(parseRevenueLayoutCookie('lanes.5.12')).toEqual({ layout: 'lanes', grid: '3', lanes: '12', matrix: 'short' })
    expect(parseRevenueLayoutCookie('board.4')).toEqual({ ...DEFAULT_REVENUE_LAYOUT, grid: '4' })
  })

  it('does not take one layout’s zoom for another’s', () => {
    expect(parseRevenueLayoutCookie('grid.12.2.3')).toEqual(DEFAULT_REVENUE_LAYOUT)
  })

  it('ignores a layout name it does not know, and keeps the zooms it can read', () => {
    expect(parseRevenueLayoutCookie('strip.4.12')).toEqual({ ...DEFAULT_REVENUE_LAYOUT, grid: '4', lanes: '12' })
  })
})

describe('resolveRevenueLayout', () => {
  const saved: RevenueLayoutChoice = { layout: 'grid', grid: '4', lanes: '3', matrix: 'color' }

  it('draws the saved choice when the address says nothing', () => {
    expect(resolveRevenueLayout(saved)).toEqual(saved)
  })

  it('lets the address switch the layout, which keeps its own saved zoom', () => {
    expect(resolveRevenueLayout(saved, 'lanes')).toEqual({ ...saved, layout: 'lanes' })
    expect(resolveRevenueLayout(saved, 'matrix')).toEqual({ ...saved, layout: 'matrix' })
  })

  it('reads the zoom for the layout the page ends up in', () => {
    expect(resolveRevenueLayout(saved, 'lanes', '12')).toEqual({ ...saved, layout: 'lanes', lanes: '12' })
    expect(resolveRevenueLayout(saved, 'matrix', 'full')).toEqual({ ...saved, layout: 'matrix', matrix: 'full' })
    expect(resolveRevenueLayout(saved, undefined, '2')).toEqual({ ...saved, grid: '2' })
  })

  it('ignores a zoom the layout does not offer, and a layout it does not know', () => {
    expect(resolveRevenueLayout(saved, 'grid', '12')).toEqual(saved)
    expect(resolveRevenueLayout(saved, 'lanes', 'full')).toEqual({ ...saved, layout: 'lanes' })
    expect(resolveRevenueLayout(saved, 'strip', 'x')).toEqual(saved)
  })
})

describe('withDensity', () => {
  it('changes the zoom of the layout that is showing, and nothing else', () => {
    const lanes: RevenueLayoutChoice = { ...DEFAULT_REVENUE_LAYOUT, layout: 'lanes' }
    expect(withDensity(lanes, '12')).toEqual({ ...lanes, lanes: '12' })
    expect(revenueDensity(withDensity(lanes, '12'))).toBe('12')
    expect(withDensity(lanes, 'full')).toEqual(lanes)
  })
})

describe('revenueCardsDense', () => {
  it('draws only a grid of six dense', () => {
    expect(revenueCardsDense({ ...DEFAULT_REVENUE_LAYOUT, grid: '6' })).toBe(true)
    expect(revenueCardsDense({ ...DEFAULT_REVENUE_LAYOUT, grid: '4' })).toBe(false)
    expect(revenueCardsDense({ ...DEFAULT_REVENUE_LAYOUT, layout: 'lanes', grid: '6' })).toBe(false)
  })
})
