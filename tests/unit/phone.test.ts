import { describe, expect, it } from 'vitest'
import { telHref } from '@/lib/phone'

describe('telHref', () => {
  it('keeps the digits and a leading plus', () => {
    expect(telHref('+49 (0) 1234 / 56 78-90')).toBe('tel:+4901234567890')
    expect(telHref('01234 567890')).toBe('tel:01234567890')
    expect(telHref(' 0171-1234567 ')).toBe('tel:01711234567')
  })

  it('is nothing for what cannot be dialled', () => {
    expect(telHref('siehe Notiz')).toBeNull()
    expect(telHref('12')).toBeNull()
    expect(telHref('')).toBeNull()
    expect(telHref(null)).toBeNull()
  })
})
