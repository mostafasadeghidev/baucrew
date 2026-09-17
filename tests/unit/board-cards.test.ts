import { describe, expect, it } from 'vitest'
import { SWATCHES, boardFilterCount, dateTone, initials, parseBoardFilter, swatchOf } from '@/lib/board-cards'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('swatchOf', () => {
  it('gives a key the same colour every time, within the palette', () => {
    expect(swatchOf('cm123')).toBe(swatchOf('cm123'))
    for (const key of ['a', 'b', 'cmu4rhc2n0000s8qhu03nb8a5', '']) {
      expect(swatchOf(key)).toBeGreaterThanOrEqual(0)
      expect(swatchOf(key)).toBeLessThan(SWATCHES)
    }
  })
})

describe('initials', () => {
  it('takes the first letter of the first and the last word', () => {
    expect(initials('Max Muster')).toBe('MM')
    expect(initials('Anna Maria Beispiel')).toBe('AB')
    expect(initials('  max ')).toBe('MA')
    expect(initials('')).toBe('?')
  })
})

describe('dateTone', () => {
  const today = day('2026-09-17')

  it('is red once the planned end has passed and the job is not over', () => {
    expect(dateTone('IN_PROGRESS', day('2026-09-01'), day('2026-09-16'), today)).toBe('late')
    expect(dateTone('PLANNED', null, day('2026-09-16'), today)).toBe('late')
    expect(dateTone('IN_PROGRESS', day('2026-09-01'), day('2026-09-17'), today)).toBeNull()
  })

  it('is amber when a job that has not started is due within the week', () => {
    expect(dateTone('APPROVED', day('2026-09-17'), null, today)).toBe('soon')
    expect(dateTone('PLANNED', day('2026-09-24'), null, today)).toBe('soon')
    expect(dateTone('PLANNED', day('2026-09-25'), null, today)).toBeNull()
    expect(dateTone('PLANNED', day('2026-09-10'), null, today)).toBeNull()
    // Already running: its start is behind it.
    expect(dateTone('IN_PROGRESS', day('2026-09-18'), null, today)).toBeNull()
  })

  it('colours nothing on a job that is over', () => {
    expect(dateTone('COMPLETED', day('2026-01-01'), day('2026-01-10'), today)).toBeNull()
    expect(dateTone('CANCELLED', day('2026-09-18'), null, today)).toBeNull()
  })
})

describe('the board filter', () => {
  it('reads the address and counts what is set', () => {
    expect(parseBoardFilter({})).toEqual({ member: null, label: null, urgent: false })
    const filter = parseBoardFilter({ member: ' e1 ', label: 'c1', urgent: '1' })
    expect(filter).toEqual({ member: 'e1', label: 'c1', urgent: true })
    expect(boardFilterCount(filter)).toBe(3)
    expect(boardFilterCount(parseBoardFilter({ urgent: 'yes' }))).toBe(0)
  })
})
