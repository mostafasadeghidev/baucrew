import { describe, expect, it } from 'vitest'
import { formatCurrency, formatThousands } from '@/lib/format'

// Intl separates the amount from the sign with a no-break space.
const nbsp = ' '

describe('formatCurrency', () => {
  it('shows the cents by default', () => {
    expect(formatCurrency(12600.4, 'de')).toBe(`12.600,40${nbsp}€`)
  })

  it('rounds to whole euros when asked, rather than cutting the cents off', () => {
    expect(formatCurrency(12600.4, 'de', { whole: true })).toBe(`12.600${nbsp}€`)
    expect(formatCurrency(12600.5, 'de', { whole: true })).toBe(`12.601${nbsp}€`)
  })

  it('shows a dash for no amount at all, whole or not', () => {
    expect(formatCurrency(null, 'de')).toBe('—')
    expect(formatCurrency(undefined, 'de', { whole: true })).toBe('—')
  })
})

describe('formatThousands', () => {
  it('writes thousands of euros the German way, one decimal at most', () => {
    expect(formatThousands(12_600, 'de')).toBe(`12,6${nbsp}T€`)
    expect(formatThousands(12_649, 'de')).toBe(`12,6${nbsp}T€`)
    expect(formatThousands(400, 'de')).toBe(`0,4${nbsp}T€`)
    expect(formatThousands(1_250_000, 'de')).toBe(`1.250${nbsp}T€`)
  })

  it('and the English way', () => {
    expect(formatThousands(12_600, 'en')).toBe('€12.6k')
  })
})
