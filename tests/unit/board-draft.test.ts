import { describe, expect, it } from 'vitest'
import {
  BOARD_COLUMNS_MAX,
  DEFAULT_BOARD_STATUSES,
  addableColumns,
  blankDraft,
  cleanBoardDraft,
  cleanBoardOrder,
  columnKind,
  copiedColumns,
  draftFromBoard,
  draftFromPreset,
  duplicateColumns,
  moveItem,
  planColumnSave,
  ruleColumn,
} from '@/lib/board-draft'
import { sitesPreset } from '@/lib/board-presets'

const TRELLO = 'trello:5f1a2b3c4d5e6f7a8b9c0d1e'

describe('columnKind', () => {
  it('tells a plain column, a rule column and a Trello column apart', () => {
    expect(columnKind(null)).toBe('status')
    expect(columnKind('paused')).toBe('rule')
    expect(columnKind(TRELLO)).toBe('trello')
  })
})

describe('duplicateColumns', () => {
  it('marks a column that repeats an earlier one — the same status by the same rule', () => {
    const twice = duplicateColumns([
      { key: 'a', status: 'LEAD', rule: null },
      { key: 'b', status: 'IN_PROGRESS', rule: null },
      { key: 'c', status: 'IN_PROGRESS', rule: 'paused' },
      { key: 'd', status: 'LEAD', rule: null },
    ])
    expect([...twice]).toEqual(['d'])
  })
})

describe('moveItem', () => {
  it('moves one item and closes the gap', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('changes nothing for ends out of range', () => {
    const list = ['a', 'b']
    expect(moveItem(list, 0, 5)).toBe(list)
    expect(moveItem(list, -1, 0)).toBe(list)
    expect(moveItem(list, 1, 1)).toBe(list)
  })
})

describe('drafts', () => {
  it('starts a blank board with the way a job runs, on blue', () => {
    const draft = blankDraft()
    expect(draft.background).toBe('blue')
    expect(draft.columns.map((c) => c.status)).toEqual(DEFAULT_BOARD_STATUSES)
    expect(draft.columns.every((c) => c.id === null && c.rule === null && c.title === '' && c.color === null)).toBe(true)
  })

  it('takes a saved board with its ids, names, rules and colours', () => {
    const draft = draftFromBoard({
      name: 'Muster',
      background: 'nope',
      columns: [
        { id: 'cmcol0001aaaa', status: 'QUOTED', title: 'Angebot fertig', rule: null, color: 'emerald' },
        { id: 'cmcol0002aaaa', status: 'IN_PROGRESS', title: null, rule: 'paused', color: 'neon' },
        { id: 'cmcol0003aaaa', status: 'GONE', title: null, rule: null, color: null },
      ],
    })
    expect(draft.background).toBeNull()
    expect(draft.columns).toEqual([
      { key: 'cmcol0001aaaa', id: 'cmcol0001aaaa', status: 'QUOTED', title: 'Angebot fertig', rule: null, color: 'emerald' },
      { key: 'cmcol0002aaaa', id: 'cmcol0002aaaa', status: 'IN_PROGRESS', title: '', rule: 'paused', color: null },
    ])
  })

  it('fills a draft from the ready-made board, and copies another board as new columns', () => {
    const draft = draftFromPreset(sitesPreset(2026))
    expect(draft.name).toBe('Aktuell laufende Baustellen')
    expect(draft.columns).toHaveLength(10)
    expect(draft.columns[1]).toMatchObject({ id: null, status: 'APPROVED', rule: 'nextYear', title: 'Aufträge für 2027' })
    const copy = copiedColumns([{ status: 'LEAD', title: 'Anfragen', rule: null, color: 'amber' }])
    expect(copy[0]).toMatchObject({ id: null, status: 'LEAD', title: 'Anfragen', rule: null, color: 'amber' })
  })

  it('a rule column stands under its rule’s status', () => {
    expect(ruleColumn('nextYear')).toMatchObject({ status: 'APPROVED', rule: 'nextYear', id: null })
  })
})

describe('addableColumns', () => {
  it('offers the statuses without a plain column and the rules not on the board', () => {
    const { statuses, rules } = addableColumns([
      { status: 'LEAD', rule: null },
      { status: 'IN_PROGRESS', rule: 'paused' },
      { status: 'IN_PROGRESS', rule: TRELLO },
    ])
    expect(statuses).not.toContain('LEAD')
    expect(statuses).toContain('IN_PROGRESS')
    expect(rules).toEqual(['nextYear', 'lowPriority', 'invoice1'])
  })
})

describe('cleanBoardDraft', () => {
  const column = (over: Record<string, unknown> = {}) => ({ id: null, status: 'LEAD', title: '', rule: null, color: null, ...over })

  it('makes a sent draft safe: names trimmed, blank names none, a rule column under its rule’s status', () => {
    const result = cleanBoardDraft({
      name: '  Muster Vertrieb ',
      background: 'green',
      columns: [
        column({ id: 'cmcol0001aaaa', title: '  Anfragen ' }),
        column({ status: 'LEAD', rule: 'paused', color: 'violet' }),
        column({ status: 'PLANNED', rule: TRELLO, title: 'x'.repeat(80), color: 'url(evil)' }),
        column({ id: '../evil', status: 'QUOTED', color: 42 }),
      ],
    })
    expect(result).toEqual({
      board: {
        name: 'Muster Vertrieb',
        background: 'green',
        showOnSites: false,
        columns: [
          { id: 'cmcol0001aaaa', status: 'LEAD', title: 'Anfragen', rule: null, color: null },
          { id: null, status: 'IN_PROGRESS', title: null, rule: 'paused', color: 'violet' },
          { id: null, status: 'PLANNED', title: 'x'.repeat(40), rule: TRELLO, color: null },
          { id: null, status: 'QUOTED', title: null, rule: null, color: null },
        ],
      },
    })
  })

  it('ticks Baustellen only on a plain yes', () => {
    const board = (showOnSites: unknown) => {
      const result = cleanBoardDraft({ name: 'X', showOnSites, columns: [column()] })
      return 'board' in result ? result.board.showOnSites : null
    }
    expect(board(true)).toBe(true)
    expect(board(false)).toBe(false)
    expect(board('true')).toBe(false)
    expect(board(1)).toBe(false)
    expect(board(undefined)).toBe(false)
  })

  it('refuses what cannot be a board', () => {
    expect(cleanBoardDraft({ name: '  ', columns: [column()] })).toEqual({ error: 'name' })
    expect(cleanBoardDraft({ name: 'X', columns: [] })).toEqual({ error: 'noColumns' })
    expect(cleanBoardDraft({ name: 'X' })).toEqual({ error: 'noColumns' })
    expect(cleanBoardDraft({ name: 'X', columns: Array.from({ length: BOARD_COLUMNS_MAX + 1 }, () => column()) })).toEqual({ error: 'tooMany' })
    expect(cleanBoardDraft({ name: 'X', columns: [column({ status: 'NOPE' })] })).toEqual({ error: 'column' })
    expect(cleanBoardDraft({ name: 'X', columns: [column({ rule: 'whatever' })] })).toEqual({ error: 'column' })
    expect(cleanBoardDraft({ name: 'X', columns: ['LEAD'] })).toEqual({ error: 'column' })
    expect(cleanBoardDraft({ name: 'X', columns: [column(), column({ title: 'B' })] })).toEqual({ error: 'duplicate' })
    expect(cleanBoardDraft(null)).toEqual({ error: 'name' })
  })

  it('takes an unknown colour as none', () => {
    const result = cleanBoardDraft({ name: 'X', background: 'hotpink', columns: [column()] })
    expect('board' in result && result.board.background).toBeNull()
  })
})

describe('planColumnSave', () => {
  const existing = [
    { id: 'cmcolaaaa0001', rule: null },
    { id: 'cmcolaaaa0002', rule: 'paused' },
    { id: 'cmcolaaaa0003', rule: TRELLO },
  ]

  it('keeps, moves, renames, recolours, removes and adds as the draft says', () => {
    const plan = planColumnSave(existing, [
      { id: 'cmcolaaaa0003', status: 'PLANNED', title: 'Neu', rule: TRELLO, color: 'teal' },
      { id: null, status: 'PAID', title: null, rule: null, color: 'lime' },
      { id: 'cmcolaaaa0001', status: 'QUOTED', title: null, rule: null, color: null },
    ])
    expect(plan.remove).toEqual(['cmcolaaaa0002'])
    expect(plan.update).toEqual([
      { id: 'cmcolaaaa0003', status: 'PLANNED', title: 'Neu', color: 'teal', sortOrder: 0 },
      { id: 'cmcolaaaa0001', status: 'QUOTED', title: null, color: null, sortOrder: 2 },
    ])
    expect(plan.create).toEqual([{ status: 'PAID', title: null, rule: null, color: 'lime', sortOrder: 1 }])
  })

  it('never takes over a column of another board, nor changes a kept column’s rule, nor keeps one twice', () => {
    const plan = planColumnSave(existing, [
      { id: 'cmothrboard01', status: 'LEAD', title: null, rule: null, color: null },
      { id: 'cmcolaaaa0001', status: 'IN_PROGRESS', title: null, rule: 'paused', color: null },
      { id: 'cmcolaaaa0002', status: 'IN_PROGRESS', title: null, rule: 'paused', color: null },
      { id: 'cmcolaaaa0002', status: 'IN_PROGRESS', title: null, rule: 'paused', color: null },
    ])
    expect(plan.update.map((u) => u.id)).toEqual(['cmcolaaaa0002'])
    expect(plan.create).toHaveLength(3)
    expect(plan.remove).toEqual(['cmcolaaaa0001', 'cmcolaaaa0003'])
  })
})

describe('cleanBoardOrder', () => {
  it('takes the dragged order, each board once, unknown ones dropped, the rest after as they stood', () => {
    expect(cleanBoardOrder(['c', 'x', 'a', 'c'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
    expect(cleanBoardOrder('nope', ['a', 'b'])).toEqual(['a', 'b'])
  })
})
