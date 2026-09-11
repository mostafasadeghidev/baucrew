import { describe, expect, it } from 'vitest'
import { contactSchema, parseEmployeeContact } from '@/lib/employee-contact'

const form = (values: Record<string, string>) => (name: string) => values[name] ?? null

describe('parseEmployeeContact', () => {
  it('stores blank fields as nothing, and no skills as an empty list', () => {
    const parsed = parseEmployeeContact(form({ phone: '', email: '', skills: '', notes: '' }))
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({ phone: null, email: null, skills: [], notes: null })
  })

  it('treats a field the form did not send as blank', () => {
    const parsed = parseEmployeeContact(form({}))
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({ phone: null, email: null, skills: [], notes: null })
  })

  it('trims what it keeps', () => {
    const parsed = parseEmployeeContact(
      form({ phone: '  0911 123456 ', email: ' muster@example.test ', skills: '', notes: '  Schlüssel im Büro  ' })
    )
    expect(parsed.data).toMatchObject({
      phone: '0911 123456',
      email: 'muster@example.test',
      notes: 'Schlüssel im Büro',
    })
  })

  it('refuses an e-mail address that is not one', () => {
    expect(parseEmployeeContact(form({ email: 'muster@' })).success).toBe(false)
    expect(parseEmployeeContact(form({ email: 'muster example.test' })).success).toBe(false)
    expect(parseEmployeeContact(form({ email: 'muster@example.test' })).success).toBe(true)
  })

  it('splits skills on a comma in either script, and drops the empty ones', () => {
    // U+060C is the Arabic comma, written as an escape to keep the source in one script.
    const parsed = parseEmployeeContact(form({ skills: 'Maler, Lackierer\u060CTrockenbau , ,' }))
    expect(parsed.data?.skills).toEqual(['Maler', 'Lackierer', 'Trockenbau'])
  })

  it('caps every field at the length the database column allows', () => {
    expect(contactSchema.safeParse({ phone: 'x'.repeat(301), email: '', skills: '', notes: '' }).success).toBe(false)
    expect(contactSchema.safeParse({ phone: '', email: '', skills: '', notes: 'x'.repeat(5001) }).success).toBe(false)
    expect(contactSchema.safeParse({ phone: 'x'.repeat(300), email: '', skills: '', notes: 'x'.repeat(5000) }).success).toBe(true)
  })
})
