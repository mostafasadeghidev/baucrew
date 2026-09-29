import { describe, expect, it } from 'vitest'
import { parseAmount } from '@/lib/amount'
import { normalizePrice } from '@/lib/import-excel'

describe('a sum of money as it is typed', () => {
  it('reads a dot before groups of three as thousands, with or without a comma', () => {
    expect(parseAmount('12.000')).toBe(12000)
    expect(parseAmount('1.500')).toBe(1500)
    expect(parseAmount('1.250.000')).toBe(1250000)
    expect(parseAmount('12.000,50')).toBe(12000.5)
  })

  it('reads a dot before one or two digits as the decimal point', () => {
    expect(parseAmount('12000.50')).toBe(12000.5)
    expect(parseAmount('1.5')).toBe(1.5)
  })

  it('takes the euro sign and spaces off, and refuses what is not a sum', () => {
    expect(parseAmount(' 12 500 € ')).toBe(12500)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('12.00.0')).toBe('invalid')
    expect(parseAmount('-5')).toBe('invalid')
    expect(parseAmount('1000000000')).toBe('invalid')
  })

  it('reads a spreadsheet cell the same way', () => {
    expect(normalizePrice('50.000')).toBe(50000)
    expect(normalizePrice('50.000,00 €')).toBe(50000)
    expect(normalizePrice(50000)).toBe(50000)
    expect(normalizePrice('offen')).toBeNull()
  })
})
