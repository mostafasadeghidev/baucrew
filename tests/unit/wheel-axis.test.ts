import { describe, expect, it } from 'vitest'
import { isVerticalWheel, wheelPixels } from '@/lib/wheel-axis'

describe('wheelPixels', () => {
  it('passes pixels through, and turns lines and pages into pixels', () => {
    expect(wheelPixels(40, 0, 900)).toBe(40)
    expect(wheelPixels(3, 1, 900)).toBe(48)
    expect(wheelPixels(-1, 2, 900)).toBe(-900)
  })
})

describe('isVerticalWheel', () => {
  it('gives the page a mostly downward swipe, sideways drift and all', () => {
    expect(isVerticalWheel(4, 60)).toBe(true)
    expect(isVerticalWheel(-3, -40)).toBe(true)
  })

  it('leaves a clearly sideways swipe to the scroll box', () => {
    expect(isVerticalWheel(50, 10)).toBe(false)
    expect(isVerticalWheel(30, 0)).toBe(false)
  })

  it('gives a tie to the page, and ignores a gesture that moves nothing', () => {
    expect(isVerticalWheel(20, -20)).toBe(true)
    expect(isVerticalWheel(0, 0)).toBe(false)
  })
})
