import { describe, expect, it } from 'vitest'
import { compressToUTF16 } from 'lz-string'
import { cardFields, foldName, hasFields, matchTrades, powerUpFields, splitAddress, unpack } from '@/lib/trello-fields'
import { parseTrelloExport } from '@/lib/trello'

/** A plugin's stored value the way Trello keeps a custom-fields power-up's: JSON, a key, lz-string inside. */
const packed = (key: string, data: unknown) => JSON.stringify({ [key]: compressToUTF16(JSON.stringify(data)) })

// Two sets of the same fields, as a board that was reworked once has them.
const FIELDS = [
  { id: 'old-name', type: 'T', name: 'Kundenname' },
  { id: 'old-address', type: 'T', name: 'Baustellenadresse' },
  { id: 'old-value', type: 'N', name: 'Auftragswert' },
  {
    id: 'old-work',
    type: 'L',
    name: 'Art der Arbeit',
    options: [
      { id: 'o1', text: 'Malern', color: {} },
      { id: 'o2', text: 'Fassade', color: {} },
    ],
  },
  { id: 'new-name', type: 'T', name: 'Kundenname' },
  { id: 'new-work', type: 'T', name: 'Art der Arbeit' },
  { id: 'wish', type: 'T', name: 'Ausführungswunsch ' },
  { id: 'visit', type: 'D', name: 'Termin Besichtigung' },
  { id: 'number', type: 'T', name: 'Kundennummer' },
  { id: 'created', type: 'T', name: 'Erstellungsdatum' },
]
const BOARD_PLUGIN = [{ idPlugin: 'p1', value: packed('CFG', { version: 1, fields: FIELDS }) }]
const cardPlugin = (values: Record<string, unknown>) => [{ idPlugin: 'p1', value: packed('FD', { __version: 1, ...values }) }]

describe('the custom-fields power-up in a Trello export', () => {
  const definitions = powerUpFields(BOARD_PLUGIN)

  it('finds the field definitions and their options', () => {
    expect(definitions?.pluginId).toBe('p1')
    expect(definitions?.fields.map((f) => f.name)).toContain('Termin Besichtigung')
    expect(definitions?.fields.find((f) => f.id === 'old-work')?.options).toEqual([
      { id: 'o1', text: 'Malern' },
      { id: 'o2', text: 'Fassade' },
    ])
  })

  it('reads a card of the old set', () => {
    const fields = cardFields(
      definitions,
      cardPlugin({ 'old-name': 'Muster', 'old-address': 'Musterweg 3, 12345 Musterstadt', 'old-value': 12500.5, 'old-work': ['o2'], number: 'K-100' })
    )
    expect(fields).toEqual({
      customerName: 'Muster',
      siteAddress: { text: 'Musterweg 3, 12345 Musterstadt', street: 'Musterweg 3', postalCode: '12345', city: 'Musterstadt' },
      orderValue: 12500.5,
      workTypes: ['Fassade'],
      customerNumber: 'K-100',
    })
  })

  it('reads a card of the new set, a date as its day, typed trades split', () => {
    const fields = cardFields(
      definitions,
      cardPlugin({ 'new-name': 'Beispiel', 'new-work': 'Malern, Spachteln und Fassade', wish: ' Frühjahr 2027 ', visit: '2026-03-05T00:00:00.000Z', created: '13.09.2026' })
    )
    expect(fields).toEqual({
      customerName: 'Beispiel',
      workTypes: ['Malern', 'Spachteln', 'Fassade'],
      executionWish: 'Frühjahr 2027',
      inspectionDate: '2026-03-05',
    })
  })

  it('lets the later definition win where a card has both', () => {
    expect(cardFields(definitions, cardPlugin({ 'old-name': 'Alt', 'new-name': 'Neu' })).customerName).toBe('Neu')
  })

  it('leaves empty values and broken data out', () => {
    expect(cardFields(definitions, cardPlugin({ 'old-value': null, 'old-name': '  ', visit: 'kein Datum' }))).toEqual({})
    expect(cardFields(definitions, [{ idPlugin: 'p1', value: 'not json' }])).toEqual({})
    expect(cardFields(definitions, [{ idPlugin: 'other', value: packed('FD', { 'old-name': 'X' }) }])).toEqual({})
    expect(cardFields(null, cardPlugin({ 'old-name': 'X' }))).toEqual({})
    expect(powerUpFields([{ idPlugin: 'p1', value: JSON.stringify({ CFG: 'rubbish' }) }])).toBeNull()
    expect(powerUpFields(undefined)).toBeNull()
    expect(unpack(42)).toBeNull()
  })

  it('reaches the parsed cards through the export parser', () => {
    const board = parseTrelloExport({
      lists: [{ id: 'L1', name: 'Anfragen' }],
      cards: [
        { id: 'C1', name: 'Muster Musterdorf', idList: 'L1', pluginData: cardPlugin({ 'new-name': 'Muster' }) },
        { id: 'C2', name: 'Beispiel', idList: 'L1' },
      ],
      pluginData: BOARD_PLUGIN,
    })!
    expect(board.cards[0].fields).toEqual({ customerName: 'Muster' })
    expect(hasFields(board.cards[0].fields)).toBe(true)
    expect(hasFields(board.cards[1].fields)).toBe(false)
  })
})

describe('splitAddress', () => {
  it('splits the shapes the office types', () => {
    expect(splitAddress('Musterweg 3, 12345 Musterstadt')).toEqual({ street: 'Musterweg 3', postalCode: '12345', city: 'Musterstadt' })
    expect(splitAddress('Musterweg 3 12345 Musterstadt')).toEqual({ street: 'Musterweg 3', postalCode: '12345', city: 'Musterstadt' })
    expect(splitAddress('12345 Musterstadt')).toEqual({ street: null, postalCode: '12345', city: 'Musterstadt' })
    expect(splitAddress('Musterweg 3, Musterstadt')).toEqual({ street: 'Musterweg 3', postalCode: null, city: 'Musterstadt' })
    expect(splitAddress('Musterweg 3a Musterstadt')).toEqual({ street: 'Musterweg 3a', postalCode: null, city: 'Musterstadt' })
    expect(splitAddress('Am Musterplatz 10-12 Bad Musterstadt')).toEqual({ street: 'Am Musterplatz 10-12', postalCode: null, city: 'Bad Musterstadt' })
    expect(splitAddress('Musterstadt')).toEqual({ street: null, postalCode: null, city: 'Musterstadt' })
    expect(splitAddress('Musterweg 3')).toEqual({ street: 'Musterweg 3', postalCode: null, city: null })
    expect(splitAddress('   ')).toEqual({ street: null, postalCode: null, city: null })
  })
})

describe('matchTrades', () => {
  const trades = [
    { id: 't1', names: ['Malern', 'Painting'] },
    { id: 't2', names: ['Fassadenanstrich', 'Facade'] },
    { id: 't3', names: ['Trockenbau', 'Drywall'] },
  ]

  it('finds a trade by its name, folded, or by the start of it', () => {
    expect(matchTrades(['malern', 'fassadenanstrich', 'Trocken'], trades)).toEqual({ ids: ['t1', 't2', 't3'], unknown: [] })
    expect(matchTrades(['Painting', 'Malern'], trades)).toEqual({ ids: ['t1'], unknown: [] })
  })

  it('leaves over what the app has no trade for', () => {
    expect(matchTrades(['Dach', 'Malern'], trades)).toEqual({ ids: ['t1'], unknown: ['Dach'] })
  })

  it('folds a name the way the fields are matched', () => {
    expect(foldName('Ausführungswunsch ')).toBe('ausfuhrungswunsch')
    expect(foldName('Straße')).toBe('strasse')
  })
})
