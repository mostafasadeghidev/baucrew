import { describe, expect, it } from 'vitest'
import {
  sitesBoard,
  BOARD_BACKGROUNDS,
  boardBackgroundCss,
  boardBackgroundKey,
  cleanBoardName,
  cleanColumnOrder,
  columnLabel,
  moveColumn,
  pickBoard,
} from '@/lib/boards'

describe('moveColumn', () => {
  const board = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED'] as const

  it('carries a column to the right, closing the gap behind it', () => {
    expect(moveColumn([...board], 'QUOTED', 'PLANNED')).toEqual(['LEAD', 'APPROVED', 'PLANNED', 'QUOTED'])
  })

  it('carries a column to the left', () => {
    expect(moveColumn([...board], 'PLANNED', 'LEAD')).toEqual(['PLANNED', 'LEAD', 'QUOTED', 'APPROVED'])
  })

  it('does nothing for a column that is not there, or is already there', () => {
    const list = [...board]
    expect(moveColumn(list, 'NOPE', 'LEAD')).toBe(list)
    expect(moveColumn(list, 'LEAD', 'GONE')).toBe(list)
    expect(moveColumn(list, 'LEAD', 'LEAD')).toBe(list)
  })
})

describe('cleanColumnOrder', () => {
  it('keeps column ids, once each, in the order given', () => {
    expect(cleanColumnOrder(['cmabcdefgh0001', 'cmabcdefgh0002', 'cmabcdefgh0001', 'NOPE!', 7])).toEqual(['cmabcdefgh0001', 'cmabcdefgh0002'])
    expect(cleanColumnOrder('cmabcdefgh0001')).toEqual([])
  })

  it('keeps the uuids the migration gave the first board’s columns', () => {
    const uuid = '3f2c9a1e-8b7d-4c6e-9f10-2a3b4c5d6e7f'
    expect(cleanColumnOrder([uuid, 'cmabcdefgh0001', '../x', '-leading'])).toEqual([uuid, 'cmabcdefgh0001'])
  })
})

describe('pickBoard', () => {
  const boards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('takes the one asked for, else the one remembered, else the first', () => {
    expect(pickBoard(boards, 'b', 'c')).toEqual({ id: 'b' })
    expect(pickBoard(boards, 'gone', 'c')).toEqual({ id: 'c' })
    expect(pickBoard(boards, null, 'gone')).toEqual({ id: 'a' })
    expect(pickBoard(boards)).toEqual({ id: 'a' })
    expect(pickBoard([])).toBeNull()
  })
})

describe('names', () => {
  it('trims a board’s name and refuses an empty one', () => {
    expect(cleanBoardName('  Vertrieb ')).toBe('Vertrieb')
    expect(cleanBoardName('   ')).toBeNull()
    expect(cleanBoardName('x'.repeat(100))).toHaveLength(60)
  })

  it('calls a column by its own name, else by the status', () => {
    expect(columnLabel({ title: 'Angebot fertig' }, 'Angebot erstellt')).toBe('Angebot fertig')
    expect(columnLabel({ title: null }, 'Angebot erstellt')).toBe('Angebot erstellt')
  })
})

describe('backgrounds', () => {
  it('takes one of its own keys and nothing else', () => {
    expect(boardBackgroundKey('blue')).toBe('blue')
    expect(boardBackgroundKey('')).toBeNull()
    expect(boardBackgroundKey('url(https://example.test/x.png)')).toBeNull()
    expect(boardBackgroundKey(null)).toBeNull()
  })

  it('draws a stored key, and nothing for none', () => {
    expect(boardBackgroundCss('blue')).toBe(BOARD_BACKGROUNDS.blue)
    expect(boardBackgroundCss('ocean')).toContain('linear-gradient')
    expect(boardBackgroundCss(null)).toBeNull()
    expect(boardBackgroundCss('nope')).toBeNull()
  })
})

describe('sitesBoard', () => {
  it('is the board ticked for Baustellen, the first in the tabs’ order should two carry it, else none', () => {
    const a = { id: 'a', showOnSites: false }
    const b = { id: 'b', showOnSites: true }
    const c = { id: 'c', showOnSites: true }
    expect(sitesBoard([a, b, c])?.id).toBe('b')
    expect(sitesBoard([a])).toBeNull()
    expect(sitesBoard([])).toBeNull()
  })
})
