import { describe, expect, it } from 'vitest'
import { entryMinutes, formatMinutes, sumMinutes, validInterval } from '@/lib/time-entries'

const at = (iso: string) => new Date(iso)

describe('time entries', () => {
  it('measures closed and open intervals', () => {
    const now = at('2026-08-26T12:00:00Z')
    expect(entryMinutes({ startedAt: at('2026-08-26T07:00:00Z'), endedAt: at('2026-08-26T11:30:00Z') }, now)).toBe(270)
    expect(entryMinutes({ startedAt: at('2026-08-26T11:00:00Z'), endedAt: null }, now)).toBe(60)
    // an end before the start never yields negative time
    expect(entryMinutes({ startedAt: at('2026-08-26T12:00:00Z'), endedAt: at('2026-08-26T11:00:00Z') }, now)).toBe(0)
  })

  it('sums and formats', () => {
    const now = at('2026-08-26T12:00:00Z')
    const total = sumMinutes(
      [
        { startedAt: at('2026-08-26T07:00:00Z'), endedAt: at('2026-08-26T09:00:00Z') },
        { startedAt: at('2026-08-26T09:30:00Z'), endedAt: null },
      ],
      now
    )
    expect(total).toBe(270)
    expect(formatMinutes(270)).toBe('4:30')
    expect(formatMinutes(5)).toBe('0:05')
    expect(formatMinutes(26 * 60)).toBe('26:00')
  })

  it('accepts plausible intervals only', () => {
    expect(validInterval(at('2026-08-26T07:00:00Z'), at('2026-08-26T16:00:00Z'))).toBe(true)
    expect(validInterval(at('2026-08-26T07:00:00Z'), at('2026-08-26T07:00:00Z'))).toBe(false)
    expect(validInterval(at('2026-08-26T07:00:00Z'), at('2026-08-27T07:00:01Z'))).toBe(false)
  })
})
