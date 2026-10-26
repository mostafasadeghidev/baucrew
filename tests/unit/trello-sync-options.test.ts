import { describe, expect, it } from 'vitest'
import { parseTrelloExport } from '@/lib/trello'
import { looksLikeOneCustomer, pinnedLists, statusForList, syncOptionsFor } from '@/lib/trello/sync-options'

// The automatic sync maps nothing by hand: a list's status comes from its
// name, a board of tasks is told from a board of customer jobs by its cards,
// and a pin on a list wins over the name.

const LIST = (n: number) => 'a'.repeat(23) + String(n)
const board = parseTrelloExport({
  id: 'c'.repeat(24),
  name: 'Muster Board',
  lists: [
    { id: LIST(1), name: 'Angebot erstellt und versendet', pos: 1 },
    { id: LIST(2), name: 'Erledigt', pos: 2 },
    { id: LIST(3), name: 'Lisa', pos: 3 },
  ],
  cards: [
    { id: 'b'.repeat(23) + '1', name: 'Muster Fassade (4100001)', idList: LIST(1), closed: false, pos: 1 },
    { id: 'b'.repeat(23) + '2', name: 'Server aufräumen', idList: LIST(3), closed: false, pos: 2 },
  ],
})!

describe('statusForList', () => {
  it('takes the status from the list name, a pin over it, and the rule\'s own fallback where the name says nothing', () => {
    expect(statusForList(LIST(1), 'Angebot erstellt und versendet', {})).toBe('QUOTED')
    expect(statusForList(LIST(2), 'Erledigt', {})).toBe('COMPLETED')
    expect(statusForList(LIST(3), 'Lisa', {})).toBe('LEAD')
    expect(statusForList(LIST(3), 'Lisa', { [LIST(3)]: 'IN_PROGRESS' })).toBe('IN_PROGRESS')
    expect(statusForList(LIST(3), 'Lisa', { [LIST(3)]: 'SKIP' })).toBe('SKIP')
  })
})

describe('pinnedLists', () => {
  it('keeps only real statuses and SKIP', () => {
    expect(pinnedLists({ a: 'QUOTED', b: 'SKIP', c: 'nonsense', d: 3 })).toEqual({ a: 'QUOTED', b: 'SKIP' })
    expect(pinnedLists(null)).toEqual({})
    expect(pinnedLists(['QUOTED'])).toEqual({})
  })
})

describe('looksLikeOneCustomer', () => {
  it('is false for a board whose cards carry job numbers or customer names, true for plain tasks', () => {
    expect(looksLikeOneCustomer(board)).toBe(false)
    const tasks = parseTrelloExport({
      id: 'c'.repeat(24),
      name: 'Zubearbeiten',
      lists: [{ id: LIST(3), name: 'Lisa', pos: 1 }],
      cards: [
        { id: 'b'.repeat(23) + '2', name: 'Server aufräumen', idList: LIST(3), closed: false, pos: 1 },
        { id: 'b'.repeat(23) + '3', name: 'AGBs prüfen', idList: LIST(3), closed: false, pos: 2 },
      ],
    })!
    expect(looksLikeOneCustomer(tasks)).toBe(true)
    expect(looksLikeOneCustomer({ ...tasks, cards: [] })).toBe(false)
  })
})

describe('syncOptionsFor', () => {
  it('builds the importer options from the board and its row', () => {
    const options = syncOptionsFor(board, { includeArchived: true, makeBoard: true, oneCustomer: null, listStatus: { [LIST(3)]: 'SKIP' } })
    expect([...options.mapping.entries()]).toEqual([
      [LIST(1), 'QUOTED'],
      [LIST(2), 'COMPLETED'],
      [LIST(3), 'SKIP'],
    ])
    expect(options.oneCustomer).toBe(false)
    expect(options.want).toEqual({ fields: true, checklists: true, comments: true, templates: false })
    expect(syncOptionsFor(board, { includeArchived: false, makeBoard: false, oneCustomer: true, listStatus: {} }).oneCustomer).toBe(true)
  })
})
