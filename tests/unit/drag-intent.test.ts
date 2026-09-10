import { describe, expect, it } from 'vitest'
import { DRAG_THRESHOLD, dragIntent } from '@/lib/drag-intent'

describe('dragIntent', () => {
  it('means nothing until the pointer has actually travelled', () => {
    expect(dragIntent(0, 0)).toBe('none')
    expect(dragIntent(3, 3)).toBe('none')
    expect(dragIntent(DRAG_THRESHOLD - 0.01, 0)).toBe('none')
  })

  it('reads a sideways pull as moving the board', () => {
    expect(dragIntent(40, 0)).toBe('board')
    expect(dragIntent(-40, 0)).toBe('board')
    expect(dragIntent(40, 10)).toBe('board')
    expect(dragIntent(-40, -10)).toBe('board')
  })

  it('reads anything else as carrying the card', () => {
    expect(dragIntent(0, 40)).toBe('card')
    expect(dragIntent(0, -40)).toBe('card')
    expect(dragIntent(10, 40)).toBe('card')
    expect(dragIntent(-10, -40)).toBe('card')
  })

  it('gives a square diagonal to the card, not the board', () => {
    expect(dragIntent(30, 30)).toBe('card')
    expect(dragIntent(-30, 30)).toBe('card')
  })

  it('decides exactly at the threshold, not one pixel later', () => {
    expect(dragIntent(DRAG_THRESHOLD, 0)).toBe('board')
    expect(dragIntent(0, DRAG_THRESHOLD)).toBe('card')
  })

  it('takes a threshold of its own', () => {
    expect(dragIntent(10, 0, 20)).toBe('none')
    expect(dragIntent(25, 0, 20)).toBe('board')
  })
})
