import { describe, expect, it } from 'vitest'
import { telHref } from '@/lib/phone'

describe('telHref', () => {
  it('keeps the digits and a leading plus', () => {
    expect(telHref('+49 (0) 9131 / 12 34-56')).toBe('tel:+4909131123456')
    expect(telHref('09131 123456')).toBe('tel:09131123456')
    expect(telHref(' 0171-1234567 ')).toBe('tel:01711234567')
  })

  it('is nothing for what cannot be dialled', () => {
    expect(telHref('siehe Notiz')).toBeNull()
    expect(telHref('12')).toBeNull()
    expect(telHref('')).toBeNull()
    expect(telHref(null)).toBeNull()
  })
})
