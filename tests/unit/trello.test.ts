import { describe, expect, it } from 'vitest'
import { parseTrelloExport, splitCardTitle } from '@/lib/trello'

describe('parseTrelloExport', () => {
  it('rejects non-Trello JSON', () => {
    expect(parseTrelloExport(null)).toBeNull()
    expect(parseTrelloExport({})).toBeNull()
    expect(parseTrelloExport({ lists: [] })).toBeNull()
    expect(parseTrelloExport('x')).toBeNull()
  })

  it('reads lists and cards, ignoring malformed items', () => {
    const board = parseTrelloExport({
      name: 'Baustellen',
      lists: [{ id: 'L1', name: 'Anfragen', closed: false }, { id: '', name: 'broken' }, 'junk'],
      cards: [
        {
          id: 'C1',
          name: '  Muster Musterdorf DD ',
          desc: 'WDVS',
          idList: 'L1',
          closed: false,
          due: '2026-09-01T00:00:00.000Z',
          labels: [{ name: 'Fassade' }, { name: '' }, null],
        },
        { id: 'C2', name: '', idList: 'L1' },
      ],
    })
    expect(board).not.toBeNull()
    expect(board!.name).toBe('Baustellen')
    expect(board!.lists).toEqual([{ id: 'L1', name: 'Anfragen', closed: false }])
    expect(board!.cards).toHaveLength(1)
    expect(board!.cards[0]).toMatchObject({
      id: 'C1',
      name: 'Muster Musterdorf DD',
      desc: 'WDVS',
      idList: 'L1',
      closed: false,
      due: '2026-09-01T00:00:00.000Z',
      labels: ['Fassade'],
    })
  })
})

describe('splitCardTitle', () => {
  it('uses the first word as the customer', () => {
    expect(splitCardTitle('Muster Musterdorf DD')).toEqual({
      customer: 'Muster',
      project: 'Muster Musterdorf DD',
    })
  })
  it('honours explicit separators', () => {
    expect(splitCardTitle('Müller GmbH - Fassade Nord')).toEqual({
      customer: 'Müller GmbH',
      project: 'Müller GmbH - Fassade Nord',
    })
    expect(splitCardTitle('Schmidt Bau: Innenanstrich')).toEqual({
      customer: 'Schmidt Bau',
      project: 'Schmidt Bau: Innenanstrich',
    })
  })
  it('handles single-word titles', () => {
    expect(splitCardTitle('Kläranlage')).toEqual({ customer: 'Kläranlage', project: 'Kläranlage' })
  })
})
