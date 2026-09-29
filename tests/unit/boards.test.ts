import { describe, expect, it } from 'vitest'
import {
  BOARD_BACKGROUNDS,
  boardBackgroundCss,
  boardBackgroundKey,
  cleanBoardName,
  cleanColumnOrder,
  columnLabel,
  columnsFromForm,
  moveColumn,
  pickBoard,
  startingLists,
} from '@/lib/boards'
import { ALL_PROJECT_STATUSES } from '@/lib/prep-tab'

const form = (picked: string[], titles: Record<string, string> = {}) => (name: string) => {
  if (name.startsWith('column_')) return picked.includes(name.slice('column_'.length)) ? 'on' : null
  if (name.startsWith('title_')) return titles[name.slice('title_'.length)] ?? ''
  return null
}

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

describe('columnsFromForm', () => {
  it('keeps the order the board was arranged in and appends what was newly ticked', () => {
    expect(columnsFromForm(form(['LEAD', 'PAID', 'PLANNED']), ['PAID', 'LEAD', 'QUOTED'])).toEqual([
      { status: 'PAID', title: null },
      { status: 'LEAD', title: null },
      { status: 'PLANNED', title: null },
    ])
  })

  it('takes a column’s own name, trimmed, and none when it is blank', () => {
    expect(columnsFromForm(form(['QUOTED', 'LEAD'], { QUOTED: '  Angebot fertig ', LEAD: '   ' }))).toEqual([
      { status: 'LEAD', title: null },
      { status: 'QUOTED', title: 'Angebot fertig' },
    ])
  })

  it('cuts a name that runs on', () => {
    const [column] = columnsFromForm(form(['LEAD'], { LEAD: 'x'.repeat(80) }))
    expect(column.title).toHaveLength(40)
  })

  it('gives no columns when nothing is ticked', () => {
    expect(columnsFromForm(form([]))).toEqual([])
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

describe('startingLists', () => {
  it('reads the three ways a board made from the bar can start', () => {
    expect(startingLists('pick:LEAD,QUOTED')).toEqual({ kind: 'pick', statuses: ['LEAD', 'QUOTED'] })
    expect(startingLists('preset:sites')).toEqual({ kind: 'preset', key: 'sites' })
    expect(startingLists('copy:cmboard0000abcd1234')).toEqual({ kind: 'copy', boardId: 'cmboard0000abcd1234' })
    // The first board, made by the migration that brought boards in.
    expect(startingLists('copy:board_all')).toEqual({ kind: 'copy', boardId: 'board_all' })
  })

  it('puts the ticked statuses in the order of the lifecycle, each once, known ones only', () => {
    expect(startingLists('pick:PAID,LEAD,LEAD,NOPE')).toEqual({ kind: 'pick', statuses: ['LEAD', 'PAID'] })
    expect(startingLists(`pick:${[...ALL_PROJECT_STATUSES].reverse().join(',')}`)).toEqual({
      kind: 'pick',
      statuses: [...ALL_PROJECT_STATUSES],
    })
  })

  it('takes nothing else — a pick of none is nothing too', () => {
    expect(startingLists('pick:')).toBeNull()
    expect(startingLists('pick:NOPE')).toBeNull()
    expect(startingLists('all')).toBeNull()
    expect(startingLists('')).toBeNull()
    expect(startingLists('copy:')).toBeNull()
    expect(startingLists('copy:../x')).toBeNull()
    expect(startingLists('preset:Sites')).toBeNull()
    expect(startingLists(null)).toBeNull()
    expect(startingLists(['pick:LEAD'])).toBeNull()
  })
})
