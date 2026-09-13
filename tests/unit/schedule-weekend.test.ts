import { describe, expect, it } from 'vitest'
import { WEEKEND_OFF, showsWeekend, weekendParam, weekendSuffix } from '@/lib/schedule-weekend'

describe('showsWeekend', () => {
  it('shows the weekend unless it was switched off', () => {
    expect(showsWeekend(undefined, false)).toBe(true)
    expect(showsWeekend('1', false)).toBe(true)
    expect(showsWeekend(WEEKEND_OFF, false)).toBe(false)
  })

  it('shows the weekend when an assignment falls on it, whatever the switch says', () => {
    expect(showsWeekend(WEEKEND_OFF, true)).toBe(true)
  })
})

describe('weekendSuffix', () => {
  it('carries only the choice to switch the weekend off to the other views', () => {
    expect(weekendSuffix(WEEKEND_OFF)).toBe('&weekend=0')
    expect(weekendSuffix(undefined)).toBe('')
    expect(weekendSuffix('1')).toBe('')
  })

  it('keeps the choice, not what a locked week shows', () => {
    // A week with a Saturday job shows the weekend, but the choice to hide it
    // elsewhere is still in the address and travels on.
    expect(showsWeekend(WEEKEND_OFF, true)).toBe(true)
    expect(weekendParam(showsWeekend(WEEKEND_OFF, false))).toBe(WEEKEND_OFF)
  })
})

describe('weekendParam', () => {
  it('leaves "on" out of the address and writes "off" as 0, and reads back what it writes', () => {
    expect(weekendParam(true)).toBeNull()
    expect(weekendParam(false)).toBe(WEEKEND_OFF)
    for (const show of [true, false]) expect(showsWeekend(weekendParam(show) ?? undefined, false)).toBe(show)
  })
})
