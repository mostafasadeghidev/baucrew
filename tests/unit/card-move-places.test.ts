import { describe, expect, it } from 'vitest'
import { assembleMovePlaces, moveColumnFor, moveFacts, type MoveRow } from '@/lib/card-move-places'

const YEAR = 2026

const row = (over: Partial<MoveRow>): MoveRow => ({
  id: 'r1',
  number: '2026-0001',
  status: 'APPROVED',
  boardPosition: null,
  pausedAt: null,
  plannedStart: null,
  planMonth: null,
  priority: 'NORMAL',
  invoice1: false,
  trelloListId: null,
  ...over,
})

const boards = [
  {
    id: 'b1',
    name: 'Erste',
    columns: [
      { id: 'c-new', status: 'NEW', title: null, rule: null },
      { id: 'c-approved', status: 'APPROVED', title: 'Auftrag', rule: null },
      { id: 'c-running', status: 'IN_PROGRESS', title: null, rule: null },
      { id: 'c-paused', status: 'IN_PROGRESS', title: null, rule: 'paused' },
    ],
  },
  { id: 'b2', name: 'Zweite', columns: [{ id: 'c2-approved', status: 'APPROVED', title: null, rule: null }] },
]

const labelFor = (status: string, rule: string | null) => (rule ? `Regel ${rule}` : status)

describe('assembleMovePlaces', () => {
  it('puts every card in the list its status and facts pick, in their placed order', () => {
    const places = assembleMovePlaces({
      boards,
      rows: [
        row({ id: 'r2', number: '2026-0002', boardPosition: 2 }),
        row({ id: 'r3', number: '2026-0003', boardPosition: 1, status: 'NEW' }),
        row({ id: 'r4', number: '2026-0004', status: 'IN_PROGRESS', pausedAt: new Date('2026-05-01') }),
        row({ id: 'r5', number: '2026-0005', status: 'COMPLETED' }),
      ],
      currentYear: YEAR,
      boardId: 'b1',
      columnId: 'c-approved',
      labelFor,
    })
    const first = places.boards[0]
    expect(first.columns.find((c) => c.id === 'c-approved')?.cardIds).toEqual(['r2'])
    expect(first.columns.find((c) => c.id === 'c-approved')?.label).toBe('Auftrag')
    // The paused card stands in the rule's list, which is called by its rule.
    expect(first.columns.find((c) => c.id === 'c-paused')?.cardIds).toEqual(['r4'])
    expect(first.columns.find((c) => c.id === 'c-paused')?.label).toBe('Regel paused')
    expect(first.columns.find((c) => c.id === 'c-new')?.cardIds).toEqual(['r3'])
    // A status no list of the board shows leaves the card out everywhere.
    expect(first.columns.flatMap((c) => c.cardIds)).not.toContain('r5')
    // The second board has its own list for the status, with the same cards.
    expect(places.boards[1].columns[0].cardIds).toEqual(['r2'])
  })

  it('orders unplaced cards newest first after the placed ones', () => {
    const places = assembleMovePlaces({
      boards: [boards[0]],
      rows: [row({ id: 'a', number: '2026-0009' }), row({ id: 'b', number: '2026-0004', boardPosition: 1 }), row({ id: 'c', number: '2026-0007' })],
      currentYear: YEAR,
      boardId: 'b1',
      columnId: null,
      labelFor,
    })
    expect(places.boards[0].columns.find((c) => c.id === 'c-approved')?.cardIds).toEqual(['b', 'a', 'c'])
  })

  it('carries the board and the column the card was opened on', () => {
    const places = assembleMovePlaces({ boards, rows: [], currentYear: YEAR, boardId: 'b2', columnId: null, labelFor })
    expect(places.boardId).toBe('b2')
    expect(places.boards).toHaveLength(2)
  })
})

describe('moveColumnFor', () => {
  const columns = boards[0].columns.map((c) => ({ key: c.id, status: c.status, rule: c.rule }))

  it('reads the list of the board the facts belong to', () => {
    expect(
      moveColumnFor(
        columns,
        moveFacts({ status: 'IN_PROGRESS', pausedAt: new Date('2026-05-01'), plannedStart: null, planMonth: null, priority: 'NORMAL', invoice1: false }),
        YEAR
      )
    ).toBe('c-paused')
    expect(moveColumnFor(columns, moveFacts({ status: 'IN_PROGRESS', pausedAt: null, plannedStart: null, planMonth: null, priority: 'NORMAL', invoice1: false }), YEAR)).toBe(
      'c-running'
    )
  })

  it('finds no list for a status the board does not show', () => {
    expect(
      moveColumnFor(columns, { ...moveFacts({ status: 'APPROVED', pausedAt: null, plannedStart: null, planMonth: null, priority: 'NORMAL', invoice1: false }), status: 'COMPLETED' }, YEAR)
    ).toBe(null)
  })
})

describe('assembleMovePlaces with a mirror list', () => {
  it("keeps a Trello list's mirror rule, so the move carries it", () => {
    const mirror = [
      {
        id: 'b3',
        name: 'Trello',
        columns: [
          { id: 'c3-lead', status: 'LEAD', title: null, rule: null },
          { id: 'c3-angebot', status: 'QUOTED', title: null, rule: 'trello:aaaaaaaaaaaaaaaaaaaaaaa1' },
          { id: 'c3-odd', status: 'QUOTED', title: null, rule: 'something-else' },
        ],
      },
    ]
    const places = assembleMovePlaces({ boards: mirror, rows: [], currentYear: YEAR, boardId: 'b3', columnId: null, labelFor })
    expect(places.boards[0].columns.map((c) => c.rule)).toEqual([null, 'trello:aaaaaaaaaaaaaaaaaaaaaaa1', null])
    expect(places.boards[0].columns[1].label).toBe('Regel trello:aaaaaaaaaaaaaaaaaaaaaaa1')
  })
})
