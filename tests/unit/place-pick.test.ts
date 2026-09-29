import { describe, expect, it } from 'vitest'
import { pickPlace } from '@/lib/place-pick'

const place = (name: string, postcodes: string[], latitude: number) => ({ name, postcodes, latitude, longitude: 9 })

describe('the place meant by a town typed without picking one', () => {
  const hits = [
    place('Musterfeld am See', ['11111'], 1),
    place('Musterfeld', ['22222', '22223'], 2),
    place('Musterfeld', ['33333'], 3),
  ]

  it('is the one of that very name, not the first the search offers', () => {
    expect(pickPlace(hits, 'musterfeld')?.latitude).toBe(2)
  })

  it('is told from another of the same name by the postal code', () => {
    expect(pickPlace(hits, 'Musterfeld', '33333')?.latitude).toBe(3)
    expect(pickPlace(hits, 'Musterfeld', '22223')?.latitude).toBe(2)
  })

  it('falls back to the first hit, and to nothing when there is none', () => {
    expect(pickPlace(hits, 'Musterfel')?.latitude).toBe(1)
    expect(pickPlace([], 'Musterfeld')).toBeNull()
  })
})
