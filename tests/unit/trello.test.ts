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
