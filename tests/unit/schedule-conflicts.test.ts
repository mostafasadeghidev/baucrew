import { describe, expect, it } from 'vitest'
import {
  detectConflicts,
  entriesOverlap,
  timeToMinutes,
  type ConflictEntry,
} from '@/lib/schedule-conflicts'

const day = new Date('2026-08-17T00:00:00.000Z')
const otherDay = new Date('2026-08-18T00:00:00.000Z')

const peter = { employee: { id: 'e1', firstName: 'Peter', lastName: 'Beispiel' } }
const hans = { employee: { id: 'e2', firstName: 'Hans', lastName: 'Muster' } }
const bus = { vehicle: { id: 'v1', name: 'Muster Bus', status: 'AVAILABLE' } }
const master = { vehicle: { id: 'v2', name: 'Master', status: 'MAINTENANCE' } }

function entry(
  id: string,
  opts: Partial<ConflictEntry> & { employees?: ConflictEntry['employees']; vehicles?: ConflictEntry['vehicles'] } = {}
): ConflictEntry {
  return {
    id,
    date: day,
    startTime: null,
    endTime: null,
    employees: [],
    vehicles: [],
    ...opts,
  }
}

describe('timeToMinutes', () => {
  it('parses HH:MM', () => {
    expect(timeToMinutes('07:30')).toBe(450)
    expect(timeToMinutes('0:05')).toBe(5)
    expect(timeToMinutes('23:59')).toBe(1439)
  })
  it('rejects empty/invalid values', () => {
    expect(timeToMinutes('')).toBeNull()
    expect(timeToMinutes(null)).toBeNull()
    expect(timeToMinutes('7')).toBeNull()
    expect(timeToMinutes('24:00')).toBeNull()
    expect(timeToMinutes('12:60')).toBeNull()
  })
})

describe('entriesOverlap', () => {
  it('treats entries without times as all-day (always overlapping)', () => {
    expect(entriesOverlap(entry('a'), entry('b'))).toBe(true)
    expect(entriesOverlap(entry('a', { startTime: '07:00', endTime: '12:00' }), entry('b'))).toBe(true)
  })
  it('detects disjoint ranges as non-overlapping', () => {
    const morning = entry('a', { startTime: '07:00', endTime: '12:00' })
    const afternoon = entry('b', { startTime: '12:00', endTime: '17:00' })
    expect(entriesOverlap(morning, afternoon)).toBe(false)
  })
  it('detects partial overlap', () => {
    const a = entry('a', { startTime: '07:00', endTime: '13:00' })
    const b = entry('b', { startTime: '12:00', endTime: '17:00' })
    expect(entriesOverlap(a, b)).toBe(true)
  })
  it('is safe with malformed ranges (end before start)', () => {
    const a = entry('a', { startTime: '13:00', endTime: '07:00' })
    const b = entry('b', { startTime: '14:00', endTime: '15:00' })
    expect(entriesOverlap(a, b)).toBe(true)
  })
})

describe('detectConflicts', () => {
  it('returns nothing for a clean day', () => {
    const conflicts = detectConflicts([
      entry('a', { employees: [peter], vehicles: [bus] }),
      entry('b', { employees: [hans] }),
    ])
    expect(conflicts).toEqual([])
  })

  it('flags an employee booked twice on the same day (all-day)', () => {
    const conflicts = detectConflicts([
      entry('a', { employees: [peter] }),
      entry('b', { employees: [peter] }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ type: 'employee', name: 'Peter Beispiel' })
    expect(conflicts[0].entryIds.sort()).toEqual(['a', 'b'])
  })

  it('does NOT flag the same employee on different days', () => {
    const conflicts = detectConflicts([
      entry('a', { employees: [peter] }),
      entry('b', { date: otherDay, employees: [peter] }),
    ])
    expect(conflicts).toEqual([])
  })

  it('does NOT flag morning + afternoon assignments with disjoint times', () => {
    const conflicts = detectConflicts([
      entry('a', { startTime: '07:00', endTime: '12:00', employees: [peter], vehicles: [bus] }),
      entry('b', { startTime: '12:30', endTime: '17:00', employees: [peter], vehicles: [bus] }),
    ])
    expect(conflicts).toEqual([])
  })

  it('flags overlapping timed assignments', () => {
    const conflicts = detectConflicts([
      entry('a', { startTime: '07:00', endTime: '13:00', employees: [peter] }),
      entry('b', { startTime: '12:00', endTime: '17:00', employees: [peter] }),
    ])
    expect(conflicts.map((c) => c.type)).toEqual(['employee'])
  })

  it('flags a vehicle used by two entries (multi-vehicle entries included)', () => {
    const conflicts = detectConflicts([
      entry('a', { vehicles: [bus] }),
      entry('b', { vehicles: [bus, { vehicle: { id: 'v9', name: 'Kangoo', status: 'AVAILABLE' } }] }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ type: 'vehicle', name: 'Muster Bus' })
  })

  it('flags vehicles that are not AVAILABLE, once per entry', () => {
    const conflicts = detectConflicts([entry('a', { vehicles: [master] })])
    expect(conflicts).toEqual([
      { type: 'vehicleUnavailable', name: 'Master', status: 'MAINTENANCE', date: day, entryIds: ['a'] },
    ])
  })

  it('reports each conflicting person/vehicle separately', () => {
    const conflicts = detectConflicts([
      entry('a', { employees: [peter, hans], vehicles: [bus] }),
      entry('b', { employees: [peter, hans], vehicles: [bus] }),
    ])
    expect(conflicts.map((c) => `${c.type}:${c.name}`).sort()).toEqual([
      'employee:Hans Muster',
      'employee:Peter Beispiel',
      'vehicle:Muster Bus',
    ])
  })
})
