import { describe, expect, it } from 'vitest'
import {
  boardConfigFromForm,
  boardConfigFromOrder,
  moveColumn,
  parseBoardConfig,
  serializeBoardConfig,
} from '@/lib/board-columns'
import { ALL_PROJECT_STATUSES } from '@/lib/prep-tab'

const form = (picked: string[]) => (name: string) =>
  picked.includes(name.replace('board_', '')) ? 'on' : null

describe('parseBoardConfig', () => {
  it('gives every status a column when nothing has been chosen', () => {
    expect(parseBoardConfig(null).statuses).toEqual([...ALL_PROJECT_STATUSES])
    expect(parseBoardConfig('').statuses).toEqual([...ALL_PROJECT_STATUSES])
  })

  it('keeps the chosen ones', () => {
    expect(parseBoardConfig('{"statuses":["LEAD","PLANNED"]}').statuses).toEqual(['LEAD', 'PLANNED'])
  })

  it('keeps the order they were stored in — the board is arranged by hand', () => {
    expect(parseBoardConfig('{"statuses":["PAID","LEAD","PLANNED"]}').statuses).toEqual([
      'PAID',
      'LEAD',
      'PLANNED',
    ])
  })

  it('drops repeats and anything that is not a status', () => {
    expect(parseBoardConfig('{"statuses":["LEAD","LEAD","NOPE",7]}').statuses).toEqual(['LEAD'])
  })

  it('falls back to every column rather than leaving a board with none', () => {
    expect(parseBoardConfig('{"statuses":[]}').statuses).toEqual([...ALL_PROJECT_STATUSES])
    expect(parseBoardConfig('{"statuses":["NOPE"]}').statuses).toEqual([...ALL_PROJECT_STATUSES])
  })

  it('survives anything that is not the JSON it expects', () => {
    expect(parseBoardConfig('{oops').statuses).toEqual([...ALL_PROJECT_STATUSES])
    expect(parseBoardConfig('"a string"').statuses).toEqual([...ALL_PROJECT_STATUSES])
    expect(parseBoardConfig('null').statuses).toEqual([...ALL_PROJECT_STATUSES])
  })
})

describe('moveColumn', () => {
  const board = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED'] as const

  it('carries a column to the right, closing the gap behind it', () => {
    expect(moveColumn([...board], 'QUOTED', 'PLANNED')).toEqual([
      'LEAD',
      'APPROVED',
      'PLANNED',
      'QUOTED',
    ])
  })

  it('carries a column to the left', () => {
    expect(moveColumn([...board], 'PLANNED', 'LEAD')).toEqual([
      'PLANNED',
      'LEAD',
      'QUOTED',
      'APPROVED',
    ])
  })

  it('does nothing when a column is dropped on itself', () => {
    expect(moveColumn([...board], 'LEAD', 'LEAD')).toEqual([...board])
  })

  it('does nothing when either end is not on the board', () => {
    expect(moveColumn([...board], 'PAID', 'LEAD')).toEqual([...board])
    expect(moveColumn([...board], 'LEAD', 'PAID')).toEqual([...board])
  })

  it('leaves the array it was given alone', () => {
    const original = [...board]
    moveColumn(original, 'LEAD', 'PLANNED')
    expect(original).toEqual([...board])
  })
})

describe('boardConfigFromForm', () => {
  it('reads the ticked boxes, in lifecycle order, for a board never arranged', () => {
    expect(boardConfigFromForm(form(['PLANNED', 'LEAD'])).statuses).toEqual(['LEAD', 'PLANNED'])
  })

  it('keeps an arranged board arranged when a box is ticked', () => {
    const current = ['PAID', 'LEAD', 'PLANNED'] as const
    expect(boardConfigFromForm(form(['PAID', 'LEAD', 'PLANNED', 'QUOTED']), [...current]).statuses)
      .toEqual(['PAID', 'LEAD', 'PLANNED', 'QUOTED'])
  })

  it('keeps the order of what survives when a box is unticked', () => {
    const current = ['PAID', 'LEAD', 'PLANNED'] as const
    expect(boardConfigFromForm(form(['PAID', 'PLANNED']), [...current]).statuses).toEqual([
      'PAID',
      'PLANNED',
    ])
  })

  it('treats "none ticked" as "all of them"', () => {
    expect(boardConfigFromForm(form([])).statuses).toEqual([...ALL_PROJECT_STATUSES])
  })
})

describe('boardConfigFromOrder', () => {
  it('takes the order it is given', () => {
    expect(boardConfigFromOrder(['PAID', 'LEAD']).statuses).toEqual(['PAID', 'LEAD'])
  })

  it('drops repeats and anything that is not a status', () => {
    expect(boardConfigFromOrder(['LEAD', 'LEAD', 'NOPE', 7, null]).statuses).toEqual(['LEAD'])
  })

  it('falls back to every column rather than storing an empty board', () => {
    expect(boardConfigFromOrder([]).statuses).toEqual([...ALL_PROJECT_STATUSES])
    expect(boardConfigFromOrder('not an array').statuses).toEqual([...ALL_PROJECT_STATUSES])
  })
})

describe('serializeBoardConfig', () => {
  it('round-trips', () => {
    const config = boardConfigFromForm(form(['LEAD', 'PAID']))
    expect(parseBoardConfig(serializeBoardConfig(config))).toEqual(config)
  })

  it('round-trips an order that is not the lifecycle', () => {
    const config = boardConfigFromOrder(['PAID', 'LEAD', 'QUOTED'])
    expect(parseBoardConfig(serializeBoardConfig(config)).statuses).toEqual([
      'PAID',
      'LEAD',
      'QUOTED',
    ])
  })
})
