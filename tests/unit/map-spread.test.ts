import { describe, expect, it } from 'vitest'
import { spreadOverlapping } from '@/lib/map-spread'

const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = (a.lat - b.lat) * 111_320
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

describe('spreadOverlapping', () => {
  it('leaves a pin that shares its place with nobody exactly where it is', () => {
    const out = spreadOverlapping([
      { id: 'a', lat: 49.5, lng: 11 },
      { id: 'b', lat: 49.6, lng: 11.2 },
    ])
    expect(out.map((p) => [p.lat, p.lng])).toEqual([
      [49.5, 11],
      [49.6, 11.2],
    ])
    expect(out.every((p) => !p.spread)).toBe(true)
  })

  it('pulls two pins on one spot apart, and says it did', () => {
    const out = spreadOverlapping([
      { id: 'a', lat: 49.7189, lng: 11.0589 },
      { id: 'b', lat: 49.7189, lng: 11.0589 },
    ])
    expect(out.every((p) => p.spread)).toBe(true)
    expect(metres(out[0], out[1])).toBeGreaterThan(400)
  })

  it('never sends a pin outside the town it belongs to', () => {
    // A German town of any size is kilometres across; a pin that walks further
    // than one is pointing at somewhere else entirely.
    const centre = { lat: 49.7189, lng: 11.0589 }
    for (const n of [2, 3, 4, 8, 20]) {
      const out = spreadOverlapping(Array.from({ length: n }, (_, i) => ({ id: i, ...centre })))
      for (const p of out) expect(metres(centre, p)).toBeLessThan(1_000)
    }
  })

  it('stands a pair one above the other, not side by side', () => {
    const out = spreadOverlapping([
      { id: 'a', lat: 49.5, lng: 11 },
      { id: 'b', lat: 49.5, lng: 11 },
    ])
    expect(Math.abs(out[0].lng - 11)).toBeLessThan(1e-9)
    expect(out[0].lat).toBeGreaterThan(49.5)
    expect(out[1].lat).toBeLessThan(49.5)
  })

  it('keeps every sharer the same distance from the place they share', () => {
    const centre = { lat: 49.4521, lng: 11.0767 }
    const out = spreadOverlapping(Array.from({ length: 4 }, (_, i) => ({ id: i, ...centre })))
    const radii = out.map((p) => metres(centre, p))
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 0)
    expect(radii[0]).toBeCloseTo(300, -1)
  })

  it('keeps the circle round: the north-south and east-west radii match', () => {
    // Straight from a difference in degrees this comes out as an ellipse —
    // a degree of longitude is half a degree of latitude up here.
    const centre = { lat: 60, lng: 10 }
    const out = spreadOverlapping(Array.from({ length: 4 }, (_, i) => ({ id: i, ...centre })))
    const radii = out.map((p) => metres(centre, p))
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(5)
  })

  it('separates two crowds without mixing them up', () => {
    const out = spreadOverlapping([
      { id: 'a', lat: 49.5, lng: 11 },
      { id: 'b', lat: 50.5, lng: 12 },
      { id: 'c', lat: 49.5, lng: 11 },
      { id: 'd', lat: 50.5, lng: 12 },
    ])
    expect(metres(out[0], out[2])).toBeGreaterThan(400)
    expect(metres({ lat: 49.5, lng: 11 }, out[0])).toBeLessThan(500)
    expect(metres({ lat: 50.5, lng: 12 }, out[1])).toBeLessThan(500)
  })

  it('tells coordinates apart that only differ far down the decimals', () => {
    const out = spreadOverlapping([
      { id: 'a', lat: 49.5, lng: 11 },
      { id: 'b', lat: 49.50001, lng: 11 },
    ])
    expect(out.every((p) => !p.spread)).toBe(true)
  })

  it('draws the same picture for the same input every time', () => {
    const points = Array.from({ length: 3 }, (_, i) => ({ id: i, lat: 49.5, lng: 11 }))
    expect(spreadOverlapping(points)).toEqual(spreadOverlapping(points))
  })

  it('carries every other field through untouched', () => {
    const out = spreadOverlapping([{ id: 'a', name: 'Muster', lat: 49.5, lng: 11 }])
    expect(out[0].name).toBe('Muster')
  })
})
