import { describe, expect, it } from 'vitest'
import { JOB_NUMBER_MAX, jobNumberOf, normalizeJobNumber, wattroKeyOf } from '@/lib/job-number'

describe('normalizeJobNumber', () => {
  it('tidies whitespace', () => {
    expect(normalizeJobNumber('  1234567  ')).toBe('1234567')
    expect(normalizeJobNumber('A  12\t3')).toBe('A 12 3')
  })

  it('reads an empty field as no number', () => {
    expect(normalizeJobNumber('')).toBeNull()
    expect(normalizeJobNumber('   ')).toBeNull()
    expect(normalizeJobNumber(null)).toBeNull()
    expect(normalizeJobNumber(undefined)).toBeNull()
  })

  it('cuts at Wattro\'s 50 characters', () => {
    expect(normalizeJobNumber('9'.repeat(80))).toHaveLength(JOB_NUMBER_MAX)
  })
})

describe('jobNumberOf', () => {
  it('is the project\'s own field', () => {
    expect(jobNumberOf({ jobNumber: '1234567' })).toBe('1234567')
    expect(jobNumberOf({ jobNumber: null })).toBeNull()
  })
})

describe('wattroKeyOf', () => {
  it('is the client\'s number when the project has one', () => {
    expect(wattroKeyOf({ jobNumber: '1234567', number: '2026-0645' })).toBe('1234567')
  })

  it('is the app\'s own number otherwise, so every project has an ID in Wattro', () => {
    expect(wattroKeyOf({ jobNumber: null, number: '2026-0645' })).toBe('2026-0645')
  })
})
