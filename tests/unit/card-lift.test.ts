import { describe, expect, it } from 'vitest'
import {
  CARRY_TILT,
  DRAG_THRESHOLD,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  carryTransform,
} from '@/lib/card-lift'

describe('carryTransform', () => {
  it('puts the carried copy exactly where the pointer has come to', () => {
    expect(carryTransform(0, 0)).toBe('translate(0px, 0px) rotate(1.5deg) scale(1.03)')
    expect(carryTransform(120, -40)).toBe('translate(120px, -40px) rotate(1.5deg) scale(1.03)')
  })

  it('carries a tall thing flat, because a tipped one pokes out of the window', () => {
    expect(carryTransform(10, 10, 0)).toBe('translate(10px, 10px) rotate(0deg) scale(1.03)')
  })

  it('keeps fractional pointer positions rather than snapping them', () => {
    expect(carryTransform(10.5, -3.25)).toContain('translate(10.5px, -3.25px)')
  })
})

describe('the numbers the gesture is made of', () => {
  it('lets a click be a click before a press becomes a drag', () => {
    expect(DRAG_THRESHOLD).toBeGreaterThan(0)
    expect(DRAG_THRESHOLD).toBeLessThan(LONG_PRESS_SLOP)
  })

  it('gives a finger long enough to mean it, but not long enough to wonder', () => {
    expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(150)
    expect(LONG_PRESS_MS).toBeLessThanOrEqual(400)
  })

  it('tips what is carried, but only just', () => {
    expect(CARRY_TILT).toBeGreaterThan(0)
    expect(CARRY_TILT).toBeLessThan(5)
  })
})
