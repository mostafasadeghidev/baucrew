import { describe, expect, it } from 'vitest'
import { boardConfigFromForm, parseBoardConfig, serializeBoardConfig } from '@/lib/board-columns'
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

  it('puts them back in the order a project lives through them', () => {
    expect(parseBoardConfig('{"statuses":["PAID","LEAD","PLANNED"]}').statuses).toEqual([
      'LEAD',
      'PLANNED',
      'PAID',
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

describe('boardConfigFromForm', () => {
  it('reads the ticked boxes, in lifecycle order', () => {
    expect(boardConfigFromForm(form(['PLANNED', 'LEAD'])).statuses).toEqual(['LEAD', 'PLANNED'])
  })

  it('treats "none ticked" as "all of them"', () => {
    expect(boardConfigFromForm(form([])).statuses).toEqual([...ALL_PROJECT_STATUSES])
  })
})

describe('serializeBoardConfig', () => {
  it('round-trips', () => {
    const config = boardConfigFromForm(form(['LEAD', 'PAID']))
    expect(parseBoardConfig(serializeBoardConfig(config))).toEqual(config)
  })
})
