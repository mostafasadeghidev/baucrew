import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDateTime, formatOfficeDate, formatThousands, officeDaysAgo } from '@/lib/format'

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

  it('puts asterisks in place of an amount while prices are hidden, the same whatever its size', () => {
    expect(formatCurrency(12600.4, 'de', { hidden: true })).toBe(`****${nbsp}€`)
    expect(formatCurrency(3, 'de', { whole: true, hidden: true })).toBe(`****${nbsp}€`)
    expect(formatCurrency(12600.4, 'en', { hidden: true })).toBe('€****')
    expect(formatCurrency(null, 'de', { hidden: true })).toBe('—')
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

  it('hides the figure behind asterisks while prices are hidden', () => {
    expect(formatThousands(12_600, 'de', true)).toBe(`****${nbsp}T€`)
    expect(formatThousands(12_600, 'en', true)).toBe('€****k')
  })
})

describe('formatDateTime', () => {
  it('shows a moment in the office’s time, summer and winter, not in UTC', () => {
    expect(formatDateTime(new Date('2026-09-30T08:15:00Z'), 'de')).toBe('30.09.2026, 10:15')
    expect(formatDateTime(new Date('2026-01-15T08:15:00Z'), 'de')).toBe('15.01.2026, 09:15')
  })

  it('keeps the day the office lives in around midnight UTC', () => {
    expect(formatDateTime(new Date('2026-09-29T23:30:00Z'), 'de')).toBe('30.09.2026, 01:30')
  })

  it('shows a dash for no moment at all', () => {
    expect(formatDateTime(null, 'de')).toBe('—')
  })
})

describe('formatOfficeDate', () => {
  it('names the Berlin day of a moment, even when UTC is still on the day before', () => {
    expect(formatOfficeDate(new Date('2026-09-29T22:30:00Z'), 'de')).toBe('30.09.2026')
    expect(formatOfficeDate(null, 'de')).toBe('—')
  })
})

describe('officeDaysAgo', () => {
  const now = new Date('2026-10-06T10:00:00Z')

  it('counts Berlin calendar days, not 24-hour spans', () => {
    expect(officeDaysAgo(new Date('2026-10-06T06:00:00Z'), now)).toBe(0)
    expect(officeDaysAgo(new Date('2026-10-05T21:59:00Z'), now)).toBe(1) // 23:59 Berlin, yesterday
    expect(officeDaysAgo(new Date('2026-10-05T22:30:00Z'), now)).toBe(0) // 00:30 Berlin, today
    expect(officeDaysAgo(new Date('2026-09-26T10:00:00Z'), now)).toBe(10)
  })

  it('never goes negative for a moment after now', () => {
    expect(officeDaysAgo(new Date('2026-10-07T10:00:00Z'), now)).toBe(0)
  })

  it('stays whole across the change to winter time', () => {
    expect(officeDaysAgo(new Date('2026-10-24T10:00:00Z'), new Date('2026-10-26T10:00:00Z'))).toBe(2)
  })
})

describe('a date that cannot be read', () => {
  // A stamp from another system is not always a moment; Intl would throw.
  const bad = new Date('irgendwann')
  it('is shown as nothing instead of taking the page down', () => {
    expect(formatDateTime(bad, 'de')).toBe('—')
    expect(formatOfficeDate(bad, 'en')).toBe('—')
  })
  it('lies no days back', () => {
    expect(officeDaysAgo(bad, new Date('2026-10-10T10:00:00Z'))).toBe(0)
  })
})
