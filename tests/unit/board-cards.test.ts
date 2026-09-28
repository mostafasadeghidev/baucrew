import { describe, expect, it } from 'vitest'
import {
  LABEL_COLORS,
  SWATCHES,
  addressLine,
  activitySince,
  boardFilterCount,
  dateTone,
  dueTone,
  initials,
  labelColorKey,
  labelSwatch,
  nextLabelColor,
  parseBoardFilter,
  swatchOf,
} from '@/lib/board-cards'

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

describe('dueTone', () => {
  const today = day('2026-09-21')

  it('is red once the day has passed, whatever the job is doing', () => {
    expect(dueTone('IN_PROGRESS', day('2026-09-20'), today)).toBe('late')
    expect(dueTone('LEAD', day('2026-09-01'), today)).toBe('late')
  })

  it('is amber within the next days, today included', () => {
    expect(dueTone('PLANNED', day('2026-09-21'), today)).toBe('soon')
    expect(dueTone('IN_PROGRESS', day('2026-09-28'), today)).toBe('soon')
    expect(dueTone('IN_PROGRESS', day('2026-09-29'), today)).toBeNull()
  })

  it('wears no colour without a day, or once the job is over', () => {
    expect(dueTone('IN_PROGRESS', null, today)).toBeNull()
    expect(dueTone('COMPLETED', day('2026-09-01'), today)).toBeNull()
    expect(dueTone('CANCELLED', day('2026-09-01'), today)).toBeNull()
  })
})

describe('addressLine', () => {
  it('puts street, postal code and town on one line', () => {
    expect(addressLine('Musterstraße 1', '12345', 'Musterstadt')).toBe('Musterstraße 1, 12345 Musterstadt')
  })

  it('makes do with what there is', () => {
    expect(addressLine(null, null, 'Musterstadt')).toBe('Musterstadt')
    expect(addressLine('Musterstraße 1', null, null)).toBe('Musterstraße 1')
    expect(addressLine(' ', '', null)).toBeNull()
  })
})

describe('the board filter', () => {
  it('reads the address and counts what is set', () => {
    expect(parseBoardFilter({})).toEqual({ members: [], labels: [], urgent: false, due: null, done: null, activity: null })
    expect(parseBoardFilter({ due: 'week' }).due).toBe('week')
    expect(parseBoardFilter({ due: 'someday' }).due).toBeNull()
    expect(boardFilterCount(parseBoardFilter({ due: 'overdue' }))).toBe(1)
    const filter = parseBoardFilter({ member: ' e1 ', label: 'c1', urgent: '1' })
    expect(filter).toEqual({ members: ['e1'], labels: ['c1'], urgent: true, due: null, done: null, activity: null })
    expect(boardFilterCount(filter)).toBe(3)
    expect(boardFilterCount(parseBoardFilter({ urgent: 'yes' }))).toBe(0)
  })

  it('takes several people and labels, "me" and "none", the tick and the activity', () => {
    const filter = parseBoardFilter({ member: 'me,e1, e2,e1', label: 'none,c1', done: '0', activity: '2w' })
    expect(filter.members).toEqual(['me', 'e1', 'e2'])
    expect(filter.labels).toEqual(['none', 'c1'])
    expect(filter.done).toBe(false)
    expect(filter.activity).toBe('2w')
    expect(boardFilterCount(filter)).toBe(7)
    expect(parseBoardFilter({ done: 'maybe', activity: '3w' })).toMatchObject({ done: null, activity: null })
  })

  it('knows where an activity window starts', () => {
    const now = new Date(Date.UTC(2026, 8, 28))
    expect(activitySince('1w', now).toISOString().slice(0, 10)).toBe('2026-09-21')
    expect(activitySince('stale', now).toISOString().slice(0, 10)).toBe('2026-08-31')
  })
})

describe('a label’s colour', () => {
  it('is the one chosen for the trade, else the one its key gets', () => {
    expect(labelSwatch('pink', 'cm1')).toBe(LABEL_COLORS.indexOf('pink'))
    expect(labelSwatch(null, 'cm1')).toBe(swatchOf('cm1'))
    expect(labelSwatch('not-a-colour', 'cm1')).toBe(swatchOf('cm1'))
  })

  it('takes only its own keys from a form', () => {
    expect(labelColorKey('lime')).toBe('lime')
    expect(labelColorKey('')).toBeNull()
    expect(labelColorKey('#ff0000')).toBeNull()
  })

  it('gives a new trade the colour the fewest wear, the earliest of those', () => {
    expect(nextLabelColor([])).toBe('sky')
    expect(nextLabelColor(['sky', 'emerald', null])).toBe('amber')
    expect(nextLabelColor([...LABEL_COLORS])).toBe('sky')
    expect(nextLabelColor([...LABEL_COLORS, 'sky'])).toBe('emerald')
  })

  it('hands out only the first eight by itself, so the old colours stay', () => {
    expect(SWATCHES).toBe(8)
    expect(LABEL_COLORS.length).toBeGreaterThanOrEqual(SWATCHES)
  })
})
