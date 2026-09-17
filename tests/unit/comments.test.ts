import { describe, expect, it } from 'vitest'
import {
  canDeleteComment,
  commentSegments,
  mentionMatches,
  mentionQuery,
  mentionTokens,
  mentionedUsers,
} from '@/lib/comments'

const people = [
  { id: 'u1', username: 'buero', name: 'Max Muster' },
  { id: 'u2', username: 'anna.b', name: 'Anna Beispiel' },
  { id: 'u3', username: 'lager', name: 'lager' },
]

describe('mentions', () => {
  it('finds the account names written with @, once each, and not e-mail addresses', () => {
    expect(mentionTokens('@buero bitte @anna.b anrufen, @buero nochmal. mail@muster.example')).toEqual(['buero', 'anna.b'])
    expect(mentionTokens('nichts')).toEqual([])
  })

  it('names the users, whatever the case', () => {
    expect(mentionedUsers('Hallo @Buero und @ANNA.B!', people).map((p) => p.id)).toEqual(['u1', 'u2'])
    expect(mentionedUsers('@niemand', people)).toEqual([])
  })

  it('cuts a body into text and the names it knows', () => {
    expect(commentSegments('Hi @buero, siehe @nobody. Ende', people)).toEqual([
      { text: 'Hi ', mention: null },
      { text: '@buero', mention: people[0] },
      { text: ', siehe @nobody. Ende', mention: null },
    ])
    expect(commentSegments('@anna.b.', people)).toEqual([
      { text: '@anna.b', mention: people[1] },
      { text: '.', mention: null },
    ])
  })

  it('knows what is being typed after an @', () => {
    expect(mentionQuery('bitte @an', 9)).toEqual({ start: 6, query: 'an' })
    expect(mentionQuery('bitte @', 7)).toEqual({ start: 6, query: '' })
    expect(mentionQuery('bitte @an fertig', 16)).toBeNull()
    expect(mentionQuery('mail@x', 6)).toBeNull()
  })

  it('offers the people whose account or name starts with what was typed', () => {
    expect(mentionMatches('an', people).map((p) => p.id)).toEqual(['u2'])
    expect(mentionMatches('mu', people).map((p) => p.id)).toEqual(['u1'])
    expect(mentionMatches('', people)).toHaveLength(3)
  })
})

describe('canDeleteComment', () => {
  it('lets the author and any administrator take a comment back', () => {
    expect(canDeleteComment({ id: 'u1', role: 'MANAGER' }, { authorId: 'u1' })).toBe(true)
    expect(canDeleteComment({ id: 'u2', role: 'MANAGER' }, { authorId: 'u1' })).toBe(false)
    expect(canDeleteComment({ id: 'u2', role: 'ADMIN' }, { authorId: 'u1' })).toBe(true)
    expect(canDeleteComment({ id: 'u1', role: 'MANAGER' }, { authorId: null })).toBe(false)
  })
})
