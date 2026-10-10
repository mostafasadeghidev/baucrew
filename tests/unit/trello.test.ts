import { describe, expect, it } from 'vitest'
import { compressToUTF16 } from 'lz-string'
import { checklistTemplatesOf, extractJobNumber, parseTrelloExport, splitCardTitle, suggestStatus, trelloDownload } from '@/lib/trello'

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
          dueComplete: true,
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
      dueComplete: true,
    })
    expect(board!.cards[0].attachments).toMatchObject([
      { name: 'Angebot.pdf', url: 'https://trello.com/1/cards/C1/attachments/a/download' },
    ])
  })

  it('copes with a card that has no attachments or url', () => {
    const board = parseTrelloExport({
      lists: [{ id: 'L1', name: 'A' }],
      cards: [{ id: 'C1', name: 'Musterbau', idList: 'L1' }],
    })
    expect(board!.cards[0]).toMatchObject({ shortUrl: '', attachments: [], labels: [], dueComplete: false })
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

  it('keeps every column of a jobs board where it was', () => {
    expect(suggestStatus('Aufträge')).toBe('APPROVED')
    expect(suggestStatus('Ausführung – Warteliste Kleinaufträge')).toBe('APPROVED')
    expect(suggestStatus('Baustellenbeginn')).toBe('PLANNED')
    expect(suggestStatus('Baustelle läuft')).toBe('IN_PROGRESS')
    expect(suggestStatus('Baustellenunterbrechung / Pause')).toBe('IN_PROGRESS')
    expect(suggestStatus('Fertigstellung')).toBe('COMPLETED')
    expect(suggestStatus('Rechnungsstellung')).toBe('INVOICED')
    expect(suggestStatus('Erledigt')).toBe('COMPLETED')
  })

  it('reads partial bills as work still going on, not as billed or merely ordered', () => {
    expect(suggestStatus('Abschlagszahlungen')).toBe('IN_PROGRESS')
  })

  it('keeps the enquiries of a sales board as enquiries', () => {
    expect(suggestStatus('Neue Anfrage Webseite')).toBe('LEAD')
    expect(suggestStatus('Neue Anfrage Privatkunde')).toBe('LEAD')
    expect(suggestStatus('Neue Anfrage Geschäftskunde')).toBe('LEAD')
    // A first talk is not a planned start, even with an appointment in the name.
    expect(suggestStatus('Erst Gespräch durchgeführt')).toBe('LEAD')
    expect(suggestStatus('Termin vereinbart / Erstgespräch geführt')).toBe('LEAD')
  })

  it('reads every step of writing, sending and chasing an offer as an offer', () => {
    // "fertig" here is an offer ready to send, not finished work.
    expect(suggestStatus('Angebot fertig – bereit zum Versand')).toBe('QUOTED')
    expect(suggestStatus('Angebot erstellen Muster')).toBe('QUOTED')
    expect(suggestStatus('Rücksprache mit BÜRO')).toBe('QUOTED')
    expect(suggestStatus('Angebot erstellt und versendet')).toBe('QUOTED')
    // A site visit before the offer is not the job's start.
    expect(suggestStatus('Kunde möchte noch Ortstermin')).toBe('QUOTED')
    expect(suggestStatus('1. Nachfragen nach 4 Tagen')).toBe('QUOTED')
    expect(suggestStatus('2. Nachfragen nach 10 Tagen')).toBe('QUOTED')
    expect(suggestStatus('Kunde unentschlossen')).toBe('QUOTED')
  })

  it('ends a sales board in an order or a cancellation', () => {
    expect(suggestStatus('Auftrag bestätigt')).toBe('APPROVED')
    expect(suggestStatus('Angebot angenommen')).toBe('APPROVED')
    expect(suggestStatus('Abgelehnt / Archiv')).toBe('CANCELLED')
  })

  it('keeps an unpaid or disputed bill a billing matter', () => {
    expect(suggestStatus('Rechnung – Nachfragen')).toBe('INVOICED')
    expect(suggestStatus('Rechnung abgelehnt')).toBe('INVOICED')
    expect(suggestStatus('Nicht bezahlt')).toBe('INVOICED')
    expect(suggestStatus('Offene Posten')).toBe('INVOICED')
    expect(suggestStatus('Mahnung')).toBe('INVOICED')
  })

  it('reads a no as a no, and waiting for a yes as an offer', () => {
    expect(suggestStatus('Nicht beauftragt')).toBe('CANCELLED')
    expect(suggestStatus('Keine Zusage')).toBe('CANCELLED')
    expect(suggestStatus('Warten auf Zusage')).toBe('QUOTED')
    expect(suggestStatus('Angebot versendet – warten auf Zusage')).toBe('QUOTED')
    expect(suggestStatus('Anfrage angenommen')).toBe('LEAD')
  })

  it('lets a job stage win over a side task named with a sales word', () => {
    expect(suggestStatus('Baustelle läuft – Material nachfragen')).toBe('IN_PROGRESS')
    expect(suggestStatus('Pause / Rücksprache mit Kunde')).toBe('IN_PROGRESS')
    expect(suggestStatus('Baustelle läuft – Nachtragsangebot')).toBe('IN_PROGRESS')
    expect(suggestStatus('Nachtrag abgelehnt – Baustelle läuft')).toBe('IN_PROGRESS')
    expect(suggestStatus('Rücksprache Bauleiter')).toBe('IN_PROGRESS')
    expect(suggestStatus('Abnahme abgelehnt')).toBe('IN_PROGRESS')
    expect(suggestStatus('Ortstermin Abnahme')).toBe('IN_PROGRESS')
    expect(suggestStatus('Ortstermin Mängel')).toBe('IN_PROGRESS')
    expect(suggestStatus('Fertig – Nachkalkulation')).toBe('COMPLETED')
    expect(suggestStatus('Abgeschlossen / Nachkalkulation')).toBe('COMPLETED')
    expect(suggestStatus('Erledigt – Kunde nachfragen Bewertung')).toBe('COMPLETED')
    expect(suggestStatus('Ortstermin Baubeginn')).toBe('PLANNED')
    expect(suggestStatus('Terminnachfrage')).toBe('PLANNED')
    expect(suggestStatus('Auftrag – Material nachfragen')).toBe('APPROVED')
    expect(suggestStatus('Unterbrochen – Rücksprache Kunde')).toBe('IN_PROGRESS')
    expect(suggestStatus('Nachfragen Material')).toBe('APPROVED')
    expect(suggestStatus('Nachfragen Lieferant')).toBe('APPROVED')
    expect(suggestStatus('Material bestellt')).toBe('APPROVED')
  })

  it('reads a waiting list of offers as offers, and any other waiting list as orders', () => {
    expect(suggestStatus('Warteliste Angebote')).toBe('QUOTED')
    expect(suggestStatus('Warteliste')).toBe('APPROVED')
    expect(suggestStatus('Erstgespräch geführt – Angebot folgt')).toBe('LEAD')
  })

  it('lets a job stage win over an order word next to it', () => {
    expect(suggestStatus('Auftrag bestätigt – Termin steht')).toBe('PLANNED')
    expect(suggestStatus('Zusage erhalten – Baustellenbeginn KW 12')).toBe('PLANNED')
    expect(suggestStatus('Angenommen & terminiert')).toBe('PLANNED')
    expect(suggestStatus('Terminzusage Kunde')).toBe('PLANNED')
    expect(suggestStatus('Beauftragt / in Arbeit')).toBe('IN_PROGRESS')
    expect(suggestStatus('SUB beauftragt – Baustelle läuft')).toBe('IN_PROGRESS')
    expect(suggestStatus('Beauftragt & fertig')).toBe('COMPLETED')
    expect(suggestStatus('Beauftragt')).toBe('APPROVED')
  })

  it('does not cancel a job because an offer for extra work was turned down', () => {
    expect(suggestStatus('Nachtragsangebot abgelehnt')).toBe('IN_PROGRESS')
    expect(suggestStatus('Angebot abgelehnt')).toBe('CANCELLED')
  })
})

describe('parseTrelloExport — everything a card carries', () => {
  const pack = (key: string, value: unknown) => JSON.stringify({ [key]: compressToUTF16(JSON.stringify(value)) })
  const board = parseTrelloExport({
    id: 'B1',
    name: 'Beispiel-Board',
    pluginData: [
      {
        value: pack('CFG', {
          fields: [
            { id: 'f-name', name: 'Kundenname', type: 'T' },
            { id: 'f-value', name: 'Auftragswert', type: 'N' },
            { id: 'f-addr', name: 'Baustellenadresse', type: 'T' },
            { id: 'f-seen', name: 'Termin Besichtigung', type: 'D' },
            { id: 'f-made', name: 'Erstellungsdatum ', type: 'D' },
            { id: 'f-other', name: 'Etwas anderes', type: 'T' },
          ],
        }),
      },
    ],
    lists: [
      { id: 'L2', name: 'Zweite', pos: 200 },
      { id: 'L1', name: 'Erste', pos: 100 },
    ],
    members: [{ id: 'M1', fullName: 'Erika Muster', username: 'erika' }],
    cards: [
      {
        id: 'C1',
        name: 'Muster Fassade (4100001)',
        idList: 'L1',
        closed: true,
        dateClosed: '2026-03-01T10:00:00.000Z',
        pos: 512,
        idMembers: ['M1'],
        idAttachmentCover: 'A1',
        attachments: [
          { id: 'A1', name: 'Foto.jpg', url: 'https://trello.com/1/cards/C1/attachments/A1/download/Foto.jpg', isUpload: true, mimeType: 'image/jpeg', bytes: 10, date: '2026-02-01T08:00:00.000Z' },
          { id: 'A2', name: 'Angebot', url: 'https://example.com/angebot', isUpload: false },
        ],
        pluginData: [
          {
            value: pack('FD', {
              __version: 1,
              'f-name': 'Max Muster',
              'f-value': 12500.5,
              'f-addr': 'Musterstraße 12, 91000 Musterstadt',
              'f-seen': '2026-02-10T08:00:00.000Z',
              'f-made': '2026-01-15T00:00:00.000Z',
              'f-other': 'bleibt weg',
              'f-unknown': 'von einem anderen Board',
            }),
          },
        ],
      },
      { id: 'C2', name: 'Beispiel ohne Felder', idList: 'L2', pluginData: [{ value: '{"FD":"kaputt"}' }] },
    ],
    checklists: [
      {
        idCard: 'C1',
        name: 'Vor Beginn',
        pos: 1,
        checkItems: [
          { name: 'Zweitens', state: 'incomplete', pos: 2 },
          { name: 'Erstens', state: 'complete', pos: 1 },
        ],
      },
      { idCard: 'C1', name: 'Leer', pos: 2, checkItems: [] },
    ],
    actions: [
      { id: 'X2', type: 'commentCard', date: '2026-02-03T09:00:00.000Z', idMemberCreator: 'M1', memberCreator: { fullName: 'Erika Muster' }, data: { text: 'Zweiter', card: { id: 'C1' } } },
      { id: 'X0', type: 'updateCard', date: '2026-02-02T09:00:00.000Z', data: { card: { id: 'C1' } } },
      { id: 'X1', type: 'commentCard', date: '2026-02-02T09:00:00.000Z', idMemberCreator: 'M1', memberCreator: { fullName: 'Erika Muster' }, data: { text: 'Erster', card: { id: 'C1' } } },
    ],
  })!

  it('puts the lists in the order of the board', () => {
    expect(board.lists.map((l) => l.id)).toEqual(['L1', 'L2'])
  })

  it('reads the Amazing Fields by their names (src/lib/trello-fields.ts), and leaves out what it does not know', () => {
    expect(board.cards[0].fields).toEqual({
      customerName: 'Max Muster',
      siteAddress: { text: 'Musterstraße 12, 91000 Musterstadt', street: 'Musterstraße 12', postalCode: '91000', city: 'Musterstadt' },
      orderValue: 12500.5,
      inspectionDate: '2026-02-10',
      createdDate: '2026-01-15',
    })
  })

  it('takes a card without readable fields as a card without fields', () => {
    expect(board.cards[1].fields).toEqual({})
  })

  it('keeps the archive, the place, the people and the cover', () => {
    expect(board.cards[0]).toMatchObject({ closed: true, dateClosed: '2026-03-01T10:00:00.000Z', pos: 512, members: ['M1'], coverAttachmentId: 'A1' })
    expect(board.cards[0].attachments.map((a) => a.isUpload)).toEqual([true, false])
    expect(board.members).toEqual([{ id: 'M1', name: 'Erika Muster' }])
  })

  it('reads checklists with their items in order, and drops an empty one', () => {
    expect(board.checklists).toHaveLength(1)
    expect(board.checklists[0].items.map((i) => [i.text, i.done])).toEqual([['Erstens', true], ['Zweitens', false]])
  })

  it('reads the comments, oldest first, and nothing else from the actions', () => {
    expect(board.comments.map((c) => c.text)).toEqual(['Erster', 'Zweiter'])
    expect(board.comments[0]).toMatchObject({ idCard: 'C1', author: 'Erika Muster', idMember: 'M1' })
  })
})

describe('trelloDownload', () => {
  it('names the card and the attachment of a Trello file address only', () => {
    const card = 'a'.repeat(24)
    const file = 'b'.repeat(24)
    expect(trelloDownload(`https://trello.com/1/cards/${card}/attachments/${file}/download/Foto.jpg`)).toEqual({ cardId: card, attachmentId: file })
    expect(trelloDownload('https://example.com/1/cards/x/attachments/y/download/z')).toBeNull()
  })
})

describe('checklists and comments in the export', () => {
  const board = parseTrelloExport({
    name: 'Muster',
    lists: [{ id: 'L1', name: 'Anfragen', closed: false }],
    cards: [
      { id: 'C1', name: 'Muster Musterdorf', idList: 'L1' },
      { id: 'C2', name: 'Beispiel Musterstadt', idList: 'L1' },
    ],
    checklists: [
      { id: 'K2', idCard: 'C1', name: 'Abnahme', pos: 2, checkItems: [{ name: 'Fotos', state: 'incomplete', pos: 1 }] },
      {
        id: 'K1',
        idCard: 'C1',
        name: 'Baustart',
        pos: 1,
        checkItems: [
          { name: 'Gerüst', state: 'complete', pos: 2 },
          { name: 'Material', state: 'incomplete', pos: 1 },
          { name: '', state: 'complete', pos: 3 },
        ],
      },
      { id: 'K3', idCard: 'C2', name: 'baustart', pos: 1, checkItems: [{ name: 'Material', state: 'complete', pos: 1 }, { name: 'Schlüssel', state: 'incomplete', pos: 2 }] },
      { id: 'K4', idCard: 'nobody', name: 'lost', checkItems: [] },
      'junk',
    ],
    actions: [
      { id: 'X1', type: 'commentCard', date: '2026-03-02T10:00:00.000Z', data: { card: { id: 'C1' }, text: 'Später' }, memberCreator: { fullName: 'Max Muster' } },
      { id: 'X2', type: 'commentCard', date: '2026-03-01T10:00:00.000Z', data: { card: { id: 'C1' }, text: 'Kunde angerufen' }, memberCreator: { username: 'mm' } },
      { id: 'X3', type: 'updateCard', date: '2026-03-01T10:00:00.000Z', data: { card: { id: 'C1' }, text: 'nicht' } },
      { id: 'X4', type: 'commentCard', date: 'no date', data: { card: { id: 'C1' }, text: 'ohne Datum' } },
      { id: 'X5', type: 'commentCard', date: '2026-03-01T10:00:00.000Z', data: { card: { id: 'C1' }, text: '   ' } },
    ],
  })!
  const ofCard = (id: string) => board.checklists.filter((cl) => cl.idCard === id)

  it('keeps the checklists by their cards in order, items in order, ticks kept, empty items and lists dropped', () => {
    expect(ofCard('C1').map((cl) => [cl.name, cl.items.map((i) => [i.text, i.done])])).toEqual([
      ['Baustart', [['Material', false], ['Gerüst', true]]],
      ['Abnahme', [['Fotos', false]]],
    ])
    expect(ofCard('C2')).toHaveLength(1)
    expect(ofCard('nobody')).toEqual([])
  })

  it('reads the comments only, oldest first, with the author Trello names', () => {
    expect(board.comments.filter((c) => c.idCard === 'C1').map(({ date, author, text }) => ({ date, author, text }))).toEqual([
      { date: '2026-03-01T10:00:00.000Z', author: 'mm', text: 'Kunde angerufen' },
      { date: '2026-03-02T10:00:00.000Z', author: 'Max Muster', text: 'Später' },
    ])
    expect(board.comments.filter((c) => c.idCard === 'C2')).toEqual([])
  })

  it('makes one template per checklist name with every item that name ever had', () => {
    expect(checklistTemplatesOf(board.checklists)).toEqual([
      { name: 'Baustart', items: ['Material', 'Gerüst', 'Schlüssel'] },
      { name: 'Abnahme', items: ['Fotos'] },
    ])
    expect(checklistTemplatesOf([{ name: 'Leer', items: [] }])).toEqual([])
  })

  it('reads a board without checklists or actions as before', () => {
    const plain = parseTrelloExport({ lists: [{ id: 'L1', name: 'A' }], cards: [{ id: 'C1', name: 'X', idList: 'L1' }] })!
    expect(plain.checklists).toEqual([])
    expect(plain.comments).toEqual([])
    expect(plain.cards[0].fields).toEqual({})
  })
})
