import { describe, expect, it } from 'vitest'
import { entryErrorKey, entrySchema } from '@/lib/schedule-entry'

const base = {
  projectId: 'p1',
  date: '2026-09-07',
  vehicleIds: [],
  employeeIds: ['e1'],
  startTime: '',
  endTime: '',
  note: '',
}

describe('a schedule entry as sent in', () => {
  it('normalises what is left empty', () => {
    const d = entrySchema.parse({ ...base, endDate: '' })
    expect(d.endDate).toBeNull()
    expect(d.startTime).toBeNull()
    expect(d.note).toBeNull()
    expect(d.saturday).toBe(false)
    expect(d.applyToExisting).toBe(true)
  })

  it('accepts a time of day and refuses one that is not', () => {
    expect(entrySchema.parse({ ...base, startTime: '7:30', endTime: '16:00' })).toMatchObject({ startTime: '7:30', endTime: '16:00' })
    expect(entrySchema.safeParse({ ...base, startTime: 'morning' }).success).toBe(false)
  })

  it('names the project as the one field with a message of its own', () => {
    const r = entrySchema.safeParse({ ...base, projectId: '' })
    expect(r.success).toBe(false)
    if (!r.success) expect(entryErrorKey(r.error.issues)).toBe('projectRequired')
    const bad = entrySchema.safeParse({ ...base, date: '7.9.2026' })
    if (!bad.success) expect(entryErrorKey(bad.error.issues)).toBe('saveFailed')
  })
})
