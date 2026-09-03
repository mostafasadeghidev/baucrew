import { describe, expect, it } from 'vitest'
import {
  linkKey,
  scoreName,
  suggestForEntry,
  suggestMatches,
  tokenize,
  type MatchProject,
} from '@/lib/plan-match'

const project = (over: Partial<MatchProject> & { id: string }): MatchProject => ({
  number: '2026-0001',
  name: 'Innenausbau',
  customer: 'Muster',
  month: null,
  ...over,
})

describe('plan ↔ project matching', () => {
  it('folds umlauts and drops punctuation', () => {
    expect(tokenize('Müller & Söhne, Fassade')).toEqual(['mueller', 'soehne', 'fassade'])
  })

  it('scores on identifying words, not on trade words', () => {
    // "Fassade" alone must never make a match.
    expect(scoreName('Musterhof Fassade', 'Fassade')).toBe(0)
    expect(scoreName('Musterhof Fassade', 'Musterhof Anstrich')).toBe(1)
  })

  it('matches the short sheet name against the longer project name', () => {
    expect(scoreName('Musterhof', 'Innenausbau · Musterhof GmbH')).toBe(1)
  })

  it('finds the project a planned line became', () => {
    const suggestion = suggestForEntry(
      { id: 'e1', name: 'Musterhof Innenausbau', month: 3 },
      [
        project({ id: 'p1', name: 'Innenausbau', customer: 'Musterhof', month: 2 }),
        project({ id: 'p2', name: 'Dachsanierung', customer: 'Beispiel AG', month: 2 }),
      ]
    )
    expect(suggestion).toMatchObject({ entryId: 'e1', projectId: 'p1', sameMonth: true })
  })

  it('says nothing when two projects are equally close', () => {
    const suggestion = suggestForEntry({ id: 'e1', name: 'Musterhof', month: null }, [
      project({ id: 'p1', name: 'Fassade', customer: 'Musterhof' }),
      project({ id: 'p2', name: 'Anstrich', customer: 'Musterhof' }),
    ])
    expect(suggestion).toBeNull()
  })

  it('says nothing when nothing is close enough', () => {
    const suggestion = suggestForEntry({ id: 'e1', name: 'Musterhof', month: 1 }, [
      project({ id: 'p1', name: 'Dachsanierung', customer: 'Beispiel AG' }),
    ])
    expect(suggestion).toBeNull()
  })

  it('lets the month break a tie without carrying a weak name', () => {
    const weak = suggestForEntry({ id: 'e1', name: 'Beispielweg 4', month: 5 }, [
      project({ id: 'p1', name: 'Fassade', customer: 'Anderer Kunde', month: 4 }),
    ])
    expect(weak).toBeNull()
  })

  it('never offers one project to two lines', () => {
    const suggestions = suggestMatches(
      [
        { id: 'e1', name: 'Musterhof Fassade', month: 1 },
        { id: 'e2', name: 'Musterhof', month: 2 },
      ],
      [project({ id: 'p1', name: 'Fassade', customer: 'Musterhof', month: 0 })]
    )
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].entryId).toBe('e1')
  })

  it('skips projects that are already linked', () => {
    const suggestions = suggestMatches(
      [{ id: 'e1', name: 'Musterhof Fassade', month: 1 }],
      [project({ id: 'p1', name: 'Fassade', customer: 'Musterhof' })],
      ['p1']
    )
    expect(suggestions).toEqual([])
  })

  it('keeps a link identifiable across a re-import', () => {
    expect(linkKey(3, 'Musterhof  Fassade ')).toBe(linkKey(3, 'musterhof fassade'))
    expect(linkKey(3, 'Musterhof')).not.toBe(linkKey(4, 'Musterhof'))
    expect(linkKey(null, 'Musterhof')).toBe('open|musterhof')
  })
})
