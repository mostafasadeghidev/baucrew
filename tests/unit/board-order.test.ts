import { describe, expect, it } from 'vitest'
import { insertIndex, isColumnSort, orderCards, positionBetween, renumbered, sortedBy, tooClose } from '@/lib/board-order'

describe('a card put down between two others', () => {
  it('takes the midpoint, or a step beyond the edge, or zero when alone', () => {
    expect(positionBetween(1, 3)).toBe(2)
    expect(positionBetween(null, 5)).toBe(4)
    expect(positionBetween(5, null)).toBe(6)
    expect(positionBetween(null, null)).toBe(0)
  })

  it('knows when the gap is used up', () => {
    expect(tooClose(1, 1 + 1e-7)).toBe(true)
    expect(tooClose(1, 2)).toBe(false)
    expect(tooClose(null, 2)).toBe(false)
  })
})

describe('the order of a column', () => {
  it('is the placed cards by position, then the rest newest first', () => {
    const cards = [
      { id: 'a', position: null, number: '2026-0001' },
      { id: 'b', position: 2, number: '2026-0002' },
      { id: 'c', position: null, number: '2026-0003' },
      { id: 'd', position: 1, number: '2026-0004' },
    ]
    expect(orderCards(cards).map((c) => c.id)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('leaves the given list alone and renumbers from zero', () => {
    const cards = [
      { id: 'b', position: 7, number: '2026-0002' },
      { id: 'a', position: 3, number: '2026-0001' },
    ]
    const ordered = orderCards(cards)
    expect(cards[0].id).toBe('b')
    expect(renumbered(ordered)).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ])
  })
})

describe('where the pointer puts a card', () => {
  it('goes before the first card whose middle is below it, else last', () => {
    expect(insertIndex([50, 150, 250], 10)).toBe(0)
    expect(insertIndex([50, 150, 250], 100)).toBe(1)
    expect(insertIndex([50, 150, 250], 300)).toBe(3)
    expect(insertIndex([], 300)).toBe(0)
  })
})

describe('sorting a column from its menu', () => {
  const day = (d: number) => new Date(Date.UTC(2026, 8, d))
  const cards = [
    { id: 'a', name: 'Wand malen', number: '2026-0001', plannedStart: day(20), createdAt: day(1) },
    { id: 'b', name: 'anstrich Flur', number: '2026-0003', plannedStart: null, createdAt: day(3) },
    { id: 'c', name: 'Fassade', number: '2026-0002', plannedStart: day(10), createdAt: day(2) },
  ]

  it('by name ignores case, by number newest first, by a date missing ones last', () => {
    expect(sortedBy(cards, 'name').map((c) => c.id)).toEqual(['b', 'c', 'a'])
    expect(sortedBy(cards, 'number').map((c) => c.id)).toEqual(['b', 'c', 'a'])
    expect(sortedBy(cards, 'start').map((c) => c.id)).toEqual(['c', 'a', 'b'])
    expect(sortedBy(cards, 'created').map((c) => c.id)).toEqual(['a', 'c', 'b'])
  })

  it('knows its own names', () => {
    expect(isColumnSort('start')).toBe(true)
    expect(isColumnSort('price')).toBe(false)
  })
})
