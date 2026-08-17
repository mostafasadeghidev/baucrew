import { describe, expect, it } from 'vitest'
import { stockShortage } from '@/lib/stock'

describe('stockShortage', () => {
  it('returns the missing amount when demand exceeds stock', () => {
    expect(stockShortage(3, 2)).toBe(1)
    expect(stockShortage(10.5, 4)).toBe(6.5)
  })
  it('returns null when stock is enough or unknown', () => {
    expect(stockShortage(2, 2)).toBeNull()
    expect(stockShortage(1, 5)).toBeNull()
    expect(stockShortage(null, 5)).toBeNull()
    expect(stockShortage(3, null)).toBeNull()
    expect(stockShortage(3, undefined)).toBeNull()
    expect(stockShortage(NaN, 3)).toBeNull()
  })
})
