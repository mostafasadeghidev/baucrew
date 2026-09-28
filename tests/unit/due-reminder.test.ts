import { describe, expect, it } from 'vitest'
import { dueMoment, parseDueTime, reminderAt, reminderKey, tzOffsetMinutes } from '@/lib/due-reminder'

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

describe('parseDueTime', () => {
  it('writes a time of day in two digits each', () => {
    expect(parseDueTime('9:5')).toBe('09:05')
    expect(parseDueTime(' 14:30 ')).toBe('14:30')
  })
  it('refuses what is no time of day', () => {
    expect(parseDueTime('24:00')).toBeNull()
    expect(parseDueTime('12:60')).toBeNull()
    expect(parseDueTime('mittags')).toBeNull()
    expect(parseDueTime(null)).toBeNull()
  })
})

describe('the due moment in Berlin', () => {
  it('knows summer and winter', () => {
    expect(tzOffsetMinutes('Europe/Berlin', new Date(Date.UTC(2026, 6, 1, 12)))).toBe(120)
    expect(tzOffsetMinutes('Europe/Berlin', new Date(Date.UTC(2026, 0, 15, 12)))).toBe(60)
  })

  it('puts a time on the day in the office’s zone', () => {
    expect(dueMoment(day(2026, 9, 29), '14:00').toISOString()).toBe('2026-09-29T12:00:00.000Z')
    expect(dueMoment(day(2026, 12, 1), '14:00').toISOString()).toBe('2026-12-01T13:00:00.000Z')
  })

  it('starts a day without a time at midnight', () => {
    expect(dueMoment(day(2026, 9, 29), null).toISOString()).toBe('2026-09-28T22:00:00.000Z')
  })

  it('keeps the hour on the night the clocks go forward', () => {
    // 29 March 2026: 02:00 becomes 03:00 in Berlin.
    expect(dueMoment(day(2026, 3, 29), '10:00').toISOString()).toBe('2026-03-29T08:00:00.000Z')
  })
})

describe('reminderAt', () => {
  it('reminds a day before when nothing was chosen', () => {
    expect(reminderAt(day(2026, 9, 29), '14:00', null)!.toISOString()).toBe('2026-09-28T12:00:00.000Z')
  })
  it('takes the choice, and none means none', () => {
    expect(reminderAt(day(2026, 9, 29), '14:00', 60)!.toISOString()).toBe('2026-09-29T11:00:00.000Z')
    expect(reminderAt(day(2026, 9, 29), '14:00', 0)!.toISOString()).toBe('2026-09-29T12:00:00.000Z')
    expect(reminderAt(day(2026, 9, 29), '14:00', -1)).toBeNull()
  })
  it('reads only the offered choices', () => {
    expect(reminderKey('1440')).toBe(1440)
    expect(reminderKey(-1)).toBe(-1)
    expect(reminderKey(7)).toBeNull()
    expect(reminderKey('')).toBeNull()
  })
})
