import { describe, expect, it } from 'vitest'
import { sitePlaceChoice } from '@/lib/site-place'

const placed = { city: 'Musterstadt', latitude: 50.1 }
const unplaced = { city: 'Musterstadt', latitude: null }

describe('the place of a site whose address is changed on the card', () => {
  it('takes the place the town picker found, as it is', () => {
    expect(sitePlaceChoice('Beispielheim', { latitude: 48.5, longitude: 9.25 }, placed)).toEqual({ latitude: 48.5, longitude: 9.25 })
    expect(sitePlaceChoice('Musterstadt', { latitude: 50.2, longitude: 8.7 }, unplaced)).toEqual({ latitude: 50.2, longitude: 8.7 })
  })

  it('looks a town up by name when the picker found none and the town is new or had no place', () => {
    expect(sitePlaceChoice('Beispielheim', { latitude: null, longitude: null }, placed)).toBe('lookUp')
    expect(sitePlaceChoice('Musterstadt', {}, unplaced)).toBe('lookUp')
  })

  it('keeps the place of a town that stays as it was', () => {
    expect(sitePlaceChoice('Musterstadt', { latitude: null, longitude: null }, placed)).toBe('keep')
  })

  it('clears the place when the town is emptied', () => {
    expect(sitePlaceChoice(null, { latitude: 50.1, longitude: 8.6 }, placed)).toBeNull()
    expect(sitePlaceChoice('', {}, placed)).toBeNull()
  })

  it('does not take coordinates that are no place on earth, or not numbers', () => {
    expect(sitePlaceChoice('Beispielheim', { latitude: 91, longitude: 8 }, placed)).toBe('lookUp')
    expect(sitePlaceChoice('Beispielheim', { latitude: 48, longitude: -181 }, placed)).toBe('lookUp')
    expect(sitePlaceChoice('Beispielheim', { latitude: '48', longitude: '9' }, placed)).toBe('lookUp')
    expect(sitePlaceChoice('Beispielheim', { latitude: Number.NaN, longitude: 9 }, placed)).toBe('lookUp')
    expect(sitePlaceChoice('Musterstadt', { latitude: 48 }, placed)).toBe('keep')
  })
})
