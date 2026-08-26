import { describe, expect, it } from 'vitest'
import { splitRangeDays } from '@/lib/schedule-range'

describe('splitRangeDays', () => {
  it('separates days to create from days the project already has', () => {
    const { newDays, existingDays } = splitRangeDays(
      ['2026-08-26', '2026-08-27', '2026-08-28'],
      ['2026-08-25', '2026-08-26', '2026-08-27'],
      '2026-08-26'
    )
    // the 26th is the edited day itself, the 27th already exists, the 28th is new
    expect(newDays).toEqual(['2026-08-28'])
    expect(existingDays).toEqual(['2026-08-27'])
  })

  it('counts everything as new without a schedule', () => {
    const { newDays, existingDays } = splitRangeDays(['2026-09-01', '2026-09-02'], [])
    expect(newDays).toHaveLength(2)
    expect(existingDays).toHaveLength(0)
  })
})
