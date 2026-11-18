import { describe, expect, it } from 'vitest'
import {
  foldText,
  metaLine,
  moveActive,
  opensSearch,
  parseRecent,
  pushRecent,
  queryWords,
  rankRows,
  scoreRow,
  wordVariants,
  type SearchField,
} from '@/lib/global-search'

describe('foldText', () => {
  it('writes umlauts and ß out and ignores case', () => {
    expect(foldText('Müller')).toBe('mueller')
    expect(foldText('MÜLLER')).toBe('mueller')
    expect(foldText('Straße')).toBe('strasse')
    expect(foldText('Größe Öl')).toBe('groesse oel')
  })

  it('drops other accents and squeezes spaces', () => {
    expect(foldText('  Café   René ')).toBe('cafe rene')
  })

  it('reads a decomposed umlaut (as macOS file names write it) like a composed one', () => {
    expect(foldText('Müller')).toBe('mueller')
  })
})

describe('queryWords', () => {
  it('cuts on spaces, lower-cases and drops repeats', () => {
    expect(queryWords('  Muster  muster Musterstadt ')).toEqual(['muster', 'musterstadt'])
  })

  it('keeps no more than six words', () => {
    expect(queryWords('a b c d e f g h')).toHaveLength(6)
  })

  it('is empty for an empty query', () => {
    expect(queryWords('   ')).toEqual([])
  })
})

describe('wordVariants', () => {
  it('asks for the umlaut and the written-out spelling of a word', () => {
    expect(wordVariants('Müller')).toEqual(['müller', 'mueller'])
    expect(wordVariants('mueller')).toEqual(['mueller', 'müller'])
  })

  it('does the same for ß and ss', () => {
    expect(wordVariants('Straße')).toEqual(['straße', 'strasse'])
    expect(wordVariants('strasse')).toEqual(['strasse', 'straße'])
  })

  it('leaves a plain word alone', () => {
    expect(wordVariants('Muster')).toEqual(['muster'])
    expect(wordVariants('2026-0048')).toEqual(['2026-0048'])
  })
})

describe('scoreRow', () => {
  const project = (over: Partial<Record<'number' | 'job' | 'name' | 'customer' | 'city', string>> = {}): SearchField[] => [
    { text: over.number ?? '2026-0048', weight: 4, code: true },
    { text: over.job ?? '1234567', weight: 4, code: true },
    { text: over.name ?? 'Muster GmbH · Malern', weight: 3 },
    { text: over.customer ?? 'Muster GmbH', weight: 2 },
    { text: over.city ?? 'Musterstadt', weight: 1 },
  ]

  it('finds "Muster" and "muster" alike', () => {
    expect(scoreRow(['Muster'], project())).toBe(scoreRow(['muster'], project()))
    expect(scoreRow(['muster'], project())).not.toBeNull()
  })

  it('finds an umlaut written either way', () => {
    const row = project({ customer: 'Bäckerei Müller', name: 'Bäckerei Müller · Fassade', city: 'Großstadt' })
    expect(scoreRow(['mueller'], row)).not.toBeNull()
    expect(scoreRow(['Müller'], row)).toBe(scoreRow(['mueller'], row))
    expect(scoreRow(['grossstadt'], row)).not.toBeNull()
    expect(scoreRow(['baeckerei'], row)).not.toBeNull()
  })

  it('finds a project by part of its number, read from the end', () => {
    expect(scoreRow(['48'], project())).not.toBeNull()
    expect(scoreRow(['0048'], project())).not.toBeNull()
    expect(scoreRow(['20260048'], project())).not.toBeNull()
    expect(scoreRow(['4567'], project())).not.toBeNull()
  })

  it('weighs the whole number above a part of it', () => {
    expect(scoreRow(['2026-0048'], project())!).toBeGreaterThan(scoreRow(['0048'], project())!)
    expect(scoreRow(['0048'], project())!).toBeGreaterThan(scoreRow(['004'], project())!)
  })

  it('needs every word somewhere', () => {
    expect(scoreRow(['muster', 'musterstadt'], project())).not.toBeNull()
    expect(scoreRow(['muster', 'berlin'], project())).toBeNull()
  })

  it('weighs a word at the start above one in the middle', () => {
    const start = scoreRow(['mal'], project({ name: 'Malern Muster' }))!
    const middle = scoreRow(['mal'], project({ name: 'Muster · Dachmalern' }))!
    expect(start).toBeGreaterThan(middle)
  })
})

describe('rankRows', () => {
  type Row = { id: string; name: string; number: string }
  const fields = (r: Row): SearchField[] => [
    { text: r.number, weight: 4, code: true },
    { text: r.name, weight: 3 },
  ]
  const rows: Row[] = [
    { id: 'a', name: 'Beispiel AG · Malern 48', number: '2026-0101' },
    { id: 'b', name: 'Muster GmbH · Trockenbau', number: '2026-0048' },
    { id: 'c', name: 'Nichts', number: '2026-0002' },
  ]

  it('puts the number above a name that only contains it, and drops what does not fit', () => {
    expect(rankRows(rows, ['48'], fields, 10).map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('keeps the database order between equals and stops at the limit', () => {
    const same = [
      { id: 'x', name: 'Muster eins', number: '1' },
      { id: 'y', name: 'Muster zwei', number: '2' },
      { id: 'z', name: 'Muster drei', number: '3' },
    ]
    expect(rankRows(same, ['muster'], fields, 2).map((r) => r.id)).toEqual(['x', 'y'])
  })
})

describe('metaLine', () => {
  it('joins what is there with a middle dot', () => {
    expect(metaLine(['Geplant', null, ' Muster GmbH ', '', 'Musterstadt'])).toBe('Geplant · Muster GmbH · Musterstadt')
  })
})

describe('recent projects', () => {
  const p = (id: string) => ({ id, title: `Muster ${id}`, meta: 'Geplant' })

  it('puts the opened project in front without a second copy', () => {
    expect(pushRecent([p('a'), p('b')], p('b')).map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('keeps no more than the maximum', () => {
    expect(pushRecent([p('a'), p('b'), p('c')], p('d'), 3).map((r) => r.id)).toEqual(['d', 'a', 'b'])
  })

  it('reads what was stored and drops anything else', () => {
    expect(parseRecent(JSON.stringify([p('a'), { id: 1 }, null]))).toEqual([p('a')])
    expect(parseRecent('not json')).toEqual([])
    expect(parseRecent(null)).toEqual([])
    expect(parseRecent('{"id":"a"}')).toEqual([])
  })
})

describe('opensSearch', () => {
  const key = (k: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  })

  it('opens on ⌘K and Ctrl+K', () => {
    expect(opensSearch(key('k', { metaKey: true }))).toBe(true)
    expect(opensSearch(key('K', { ctrlKey: true }))).toBe(true)
  })

  it('leaves "/" to the board and other keys alone', () => {
    expect(opensSearch(key('/'))).toBe(false)
    expect(opensSearch(key('k'))).toBe(false)
    expect(opensSearch(key('k', { metaKey: true, shiftKey: true }))).toBe(false)
  })
})

describe('moveActive', () => {
  it('goes round at both ends', () => {
    expect(moveActive(2, 3, 1)).toBe(0)
    expect(moveActive(0, 3, -1)).toBe(2)
    expect(moveActive(0, 0, 1)).toBe(0)
  })
})
