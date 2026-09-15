import { describe, expect, it } from 'vitest'
import { invoicePartOf, parseInvoiceAmount, suggestedInvoiceAmount } from '@/lib/invoices'

describe('invoices', () => {
  it('reads a part as a number or by its name', () => {
    expect(invoicePartOf('1')).toBe(1)
    expect(invoicePartOf(2)).toBe(2)
    expect(invoicePartOf(' First ')).toBe(1)
    expect(invoicePartOf('final')).toBe(2)
    expect(invoicePartOf('3')).toBeNull()
    expect(invoicePartOf('')).toBeNull()
  })

  it('asks half first and what is left at the end', () => {
    expect(suggestedInvoiceAmount(1, 12_345.67, null)).toBe(6172.84)
    // Nothing marked yet: the other half.
    expect(suggestedInvoiceAmount(2, 12_345.67, null)).toBe(6172.84)
    // Follow-on offers raised the value after the first invoice: the final carries them.
    expect(suggestedInvoiceAmount(2, 13_345.67, 6172.84)).toBe(7172.83)
    expect(suggestedInvoiceAmount(2, 1000, 1500)).toBe(0)
    expect(suggestedInvoiceAmount(1, null, null)).toBeNull()
  })

  it('reads an amount the way the office types it', () => {
    expect(parseInvoiceAmount('12.500,50')).toBe(12500.5)
    expect(parseInvoiceAmount('12.500')).toBe(12500)
    expect(parseInvoiceAmount('12500.5')).toBe(12500.5)
    expect(parseInvoiceAmount(' 12 500 € ')).toBe(12500)
    expect(parseInvoiceAmount('6172,84')).toBe(6172.84)
    expect(parseInvoiceAmount('')).toBeNull()
    expect(parseInvoiceAmount('12,5,0')).toBe('invalid')
    expect(parseInvoiceAmount('-5')).toBe('invalid')
    expect(parseInvoiceAmount('abc')).toBe('invalid')
    expect(parseInvoiceAmount('1.5')).toBe(1.5)
  })
})
