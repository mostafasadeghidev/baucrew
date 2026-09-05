import { describe, expect, it } from 'vitest'
import { extractJobNumber, parseTrelloExport, splitCardTitle, suggestStatus } from '@/lib/trello'

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
          shortUrl: 'https://trello.com/c/abc',
          labels: [{ name: 'Fassade' }, { name: '' }, null],
          attachments: [
            { name: 'Angebot.pdf', url: 'https://trello.com/1/cards/C1/attachments/a/download' },
            { name: 'kein Link', url: '' },
          ],
        },
        { id: 'C2', name: '', idList: 'L1' },
      ],
    })
    expect(board).not.toBeNull()
    expect(board!.lists).toEqual([{ id: 'L1', name: 'Anfragen', closed: false }])
    expect(board!.cards).toHaveLength(1)
    expect(board!.cards[0]).toMatchObject({
      name: 'Muster Musterdorf DD',
      shortUrl: 'https://trello.com/c/abc',
      labels: ['Fassade'],
    })
    expect(board!.cards[0].attachments).toEqual([
      { name: 'Angebot.pdf', url: 'https://trello.com/1/cards/C1/attachments/a/download' },
    ])
  })

  it('copes with a card that has no attachments or url', () => {
    const board = parseTrelloExport({
      lists: [{ id: 'L1', name: 'A' }],
      cards: [{ id: 'C1', name: 'Musterbau', idList: 'L1' }],
    })
    expect(board!.cards[0]).toMatchObject({ shortUrl: '', attachments: [], labels: [] })
  })
})

describe('extractJobNumber', () => {
  it('takes the number out of the trailing bracket', () => {
    expect(extractJobNumber('Musterhof Innenausbau (4100001)')).toEqual({
      number: '4100001',
      title: 'Musterhof Innenausbau',
    })
  })
  it('takes the first number when a bracket holds several', () => {
    expect(extractJobNumber('Musterbau ( 4100003 u. 4100004 NEU )')).toEqual({
      number: '4100003',
      title: 'Musterbau',
    })
  })
  it('leaves a bracket without a number alone', () => {
    expect(extractJobNumber('Musterbau (Rest)')).toEqual({
      number: null,
      title: 'Musterbau (Rest)',
    })
  })
  it('ignores a number that is not at the end', () => {
    expect(extractJobNumber('Haus 12 Musterweg')).toEqual({
      number: null,
      title: 'Haus 12 Musterweg',
    })
  })
})

describe('splitCardTitle', () => {
  it('uses the first word as the customer and drops the job number', () => {
    expect(splitCardTitle('Musterhof Anna Musterstadt (4100002)')).toEqual({
      customer: 'Musterhof',
      project: 'Musterhof Anna Musterstadt',
      number: '4100002',
      confident: true,
    })
  })

  it('reads past a qualifier to the real customer', () => {
    expect(splitCardTitle('HV Musterhof / Beispielweg 79')).toMatchObject({
      customer: 'Musterhof',
      confident: true,
    })
    // The colon leaves the qualifier alone on the left; the name is on the right.
    expect(splitCardTitle('BV: Musterhof Beispielstraße, Musterstadt')).toMatchObject({
      customer: 'Musterhof',
      confident: true,
    })
    expect(splitCardTitle('WEG Musterweg 8')).toMatchObject({ customer: 'Musterweg' })
  })

  it('keeps an institution together with its place', () => {
    expect(splitCardTitle('Gemeinde Musterdorf Schule')).toMatchObject({
      customer: 'Gemeinde Musterdorf',
      confident: true,
    })
    expect(splitCardTitle('BV Stadt Musterstadt Rathaus')).toMatchObject({
      customer: 'Stadt Musterstadt',
    })
  })

  it('flags a title that names a building instead of a customer', () => {
    const parsed = splitCardTitle('Kläranlage Musterdorf PUTZ (4100005)')
    // Never file every "Kläranlage" job under one invented customer.
    expect(parsed.customer).toBe('Kläranlage Musterdorf PUTZ')
    expect(parsed.confident).toBe(false)
  })

  it('strips trailing punctuation from the customer', () => {
    expect(splitCardTitle('Musterhof, Musterstadt Schranke 15')).toMatchObject({
      customer: 'Musterhof',
    })
  })

  it('handles a single-word title', () => {
    expect(splitCardTitle('Musterbau')).toMatchObject({
      customer: 'Musterbau',
      project: 'Musterbau',
      number: null,
    })
  })
})

describe('suggestStatus', () => {
  it('reads the German column names the office uses', () => {
    // "Auftrag" and "Aufträge" differ by an umlaut — both must land on the same status.
    expect(suggestStatus('AUFTRÄGE')).toBe('APPROVED')
    expect(suggestStatus('Auftrag')).toBe('APPROVED')
    expect(suggestStatus('Aufträge für 2027')).toBe('APPROVED')
    expect(suggestStatus('Baustelle läuft')).toBe('IN_PROGRESS')
    expect(suggestStatus('Baustellenunterbrechung / Pause')).toBe('IN_PROGRESS')
    expect(suggestStatus('Rechnungsstellung')).toBe('INVOICED')
    expect(suggestStatus('Erledigt')).toBe('COMPLETED')
    expect(suggestStatus('Fertigstellung')).toBe('COMPLETED')
  })

  it('reads "Baustellenbeginn" as planned, not as running', () => {
    expect(suggestStatus('Baustellenbeginn')).toBe('PLANNED')
  })
})
