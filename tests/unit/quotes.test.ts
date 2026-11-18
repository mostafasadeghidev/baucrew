// Reading quotes out of a PDF's words (src/lib/quotes.ts). Every text here is
// invented — "Muster", "Beispiel", "Musterstadt" — and laid out the way the
// lines come out of src/lib/quote-pdf.ts: two spaces where the page has a gap.
import { describe, expect, it } from 'vitest'
import {
  cleanQuoteFacts,
  consistentTotals,
  hasTextLayer,
  isSupplement,
  jobNumberDiffers,
  jobNumberFromQuotes,
  linesFromItems,
  parseAmount,
  parseGermanDate,
  priceDecision,
  quoteTotals,
  readQuoteText,
  startsInTotal,
  type ProjectQuote,
} from '@/lib/quotes'

/** A quote from the accounting program: page head, Baustellennr., positions, the total row. */
const programQuote = [
  [
    'Muster Malerbetrieb GmbH  ·  Beispielweg 1  ·  12345 Musterstadt',
    'Herrn',
    'Max Mustermann',
    'Musterstraße 5',
    '12345 Musterstadt',
    'Angebot  1269001  Datum  24.03.2026',
    'Baustellennr.  4100123',
    'Kunden-Nr.  10001',
    'BV: Fassadenanstrich Musterhaus',
    'OZ  Menge  Einheit  Einheitspreis EUR  Gesamtbetrag EUR',
    '1.1  120,00  m²  18,50  2.220,00',
    '1.2  1,00  psch  480,00  480,00',
  ],
  [
    'Angebot  1269001  Datum  24.03.2026  Seite  2',
    'Titelsumme  Malerarbeiten  2.700,00',
    'Netto/EUR  Steuer/EUR  Brutto/EUR',
    'Gesamtbetrag  2.700,00  513,00  19,00%  3.213,00',
    'An unser Angebot halten wir uns 6 Wochen gebunden.',
  ],
]

describe('a quote in the accounting program’s layout', () => {
  it('is read for its totals, numbers and date', () => {
    const facts = readQuoteText(programQuote)
    expect(facts).toMatchObject({
      isQuote: true,
      docType: 'Angebot',
      layout: 'table',
      quoteNumber: '1269001',
      jobNumber: '4100123',
      quoteDate: '2026-03-24',
      net: 2700,
      vat: 513,
      vatRate: 19,
      gross: 3213,
    })
  })

  it('takes the Vorgangsnummer from a cover letter’s "Vorgang-Nr." and its quote from the head after it', () => {
    const letter = [
      ['Muster Malerbetrieb GmbH', 'Vorgang-Nr.  4100777  Datum:  02.04.2026  Blatt:  1', 'Sehr geehrte Damen und Herren,', 'anbei unser Angebot.'],
      ...programQuote.map((page) => page.map((l) => l.replace('Baustellennr.  4100123', 'Baustellennr.  4100777'))),
    ]
    const facts = readQuoteText(letter)
    expect(facts.isQuote).toBe(true)
    expect(facts.quoteNumber).toBe('1269001')
    expect(facts.jobNumber).toBe('4100777')
  })

  it('takes the last total row when a summary comes before it', () => {
    const pages = [
      ['Angebot  1269002  Datum  01.02.2026', 'Baustellennr.  4100124', 'Los 1 Gesamtsumme Netto', 'Gesamtbetrag  100,00  19,00  19,00%  119,00'],
      ['Angebot  1269002  Datum  01.02.2026', 'Gesamtbetrag  12.345,60  2.345,66  19,00%  14.691,26'],
    ]
    expect(readQuoteText(pages)).toMatchObject({ net: 12345.6, vat: 2345.66, gross: 14691.26 })
  })

  it('reads a supplement ("Angebot Nachtrag NA 1") as a quote', () => {
    const pages = [['Angebot Nachtrag NA 1  1269003  Datum  15.05.2026', 'Baustellennr.  4100123', 'Gesamtbetrag  1.000,00  190,00  19,00%  1.190,00']]
    expect(readQuoteText(pages)).toMatchObject({ isQuote: true, docType: 'Angebot Nachtrag NA 1', net: 1000, gross: 1190 })
  })

  it('does not take an invoice or an order confirmation in the same layout for a quote', () => {
    for (const kind of ['Rechnung', 'Schlussrechnung', 'Bestätigung']) {
      const pages = [[`${kind}  1269004  Datum  01.06.2026`, 'Baustellennr.  4100123', 'bezogen auf unser Angebot vom 24.03.2026', 'Gesamtbetrag  2.700,00  513,00  19,00%  3.213,00']]
      const facts = readQuoteText(pages)
      expect(facts.isQuote).toBe(false)
      expect(facts.docType).toBe(kind)
      expect(facts.net).toBeNull()
    }
  })

  it('leaves the sums empty rather than guess when the total row does not add up', () => {
    const pages = [['Angebot  1269005  Datum  01.02.2026', 'Baustellennr.  4100125', 'Gesamtbetrag  2.700,00  500,00  19,00%  3.213,00']]
    const facts = readQuoteText(pages)
    expect(facts.isQuote).toBe(true)
    expect(facts.net).toBeNull()
    expect(facts.gross).toBeNull()
  })
})

describe('a quote of another layout', () => {
  it('is read by its labels', () => {
    const pages = [
      [
        'Beispiel Bau GmbH',
        'Angebot Nr. A-2026-17',
        'Datum: 05.05.2026',
        'Baustellennummer: 4100200',
        'Pos. 1  Wand spachteln  1.500,00',
        'Summe netto  EUR  1.500,00',
        'zzgl. 19% MwSt.  285,00',
        'Gesamtbetrag inkl. MwSt.  1.785,00 €',
      ],
    ]
    expect(readQuoteText(pages)).toMatchObject({
      isQuote: true,
      layout: 'labels',
      quoteNumber: 'A-2026-17',
      jobNumber: '4100200',
      quoteDate: '2026-05-05',
      net: 1500,
      vat: 285,
      vatRate: 19,
      gross: 1785,
    })
  })

  it('works out VAT from net and gross at a German rate', () => {
    const pages = [['Nachtragsangebot', 'Muster GmbH, Musterstadt', 'Nettobetrag:  2.000,00', 'Bruttobetrag:  2.380,00']]
    expect(readQuoteText(pages)).toMatchObject({ isQuote: true, docType: 'Nachtragsangebot', net: 2000, vat: 380, gross: 2380, vatRate: 19 })
  })

  it('is no quote when it has no sum — a tender form with blanks to fill', () => {
    const pages = [['Angebot', 'Leistungsverzeichnis Musterschule', 'Angebotssumme, Netto:  EUR  ..............................', 'zzgl. MwSt. (19,0 %):  EUR  ..............................']]
    expect(readQuoteText(pages).isQuote).toBe(false)
  })

  it('is no quote when it says "Angebot" only in passing', () => {
    const pages = [['Muster GmbH', 'Rechnung Nr. 55', 'gemäß unserem Angebot vom 01.01.2026', 'Nettobetrag  1.000,00', 'Bruttobetrag  1.190,00']]
    expect(readQuoteText(pages).isQuote).toBe(false)
  })

  it('does not take a supplier’s own "Vorgang" number for the Vorgangsnummer', () => {
    const pages = [['Angebot', 'Vorgang  123456789  BV: Musterhaus', 'Nettowert  100,00', 'Summe netto  100,00', 'Summe brutto  119,00']]
    const facts = readQuoteText(pages)
    expect(facts.isQuote).toBe(true)
    expect(facts.jobNumber).toBeNull()
  })

  it('decides by the words, never the file’s name: no words, no quote', () => {
    expect(readQuoteText([[''], ['  ']])).toMatchObject({ isQuote: false })
    expect(hasTextLayer([['Angebot']])).toBe(false)
  })
})

describe('the pieces', () => {
  it('reads German amounts and nothing else', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('234,00')).toBe(234)
    expect(parseAmount('1,234.56')).toBeNull()
    expect(parseAmount('19')).toBeNull()
  })

  it('reads German dates, real ones only', () => {
    expect(parseGermanDate('Datum 24.03.2026')).toBe('2026-03-24')
    expect(parseGermanDate('01.02.26')).toBe('2026-02-01')
    expect(parseGermanDate('31.02.2026')).toBeNull()
  })

  it('builds rows from positioned pieces, a gap becoming two spaces', () => {
    const lines = linesFromItems([
      { str: 'Gesamtbetrag', x: 50, y: 100, width: 60, height: 9 },
      { str: '2.700,00', x: 300, y: 100.5, width: 40, height: 9 },
      { str: 'Angebot', x: 50, y: 700, width: 40, height: 9 },
      { str: '1269001', x: 120, y: 700, width: 40, height: 9 },
    ])
    expect(lines).toEqual(['Angebot  1269001', 'Gesamtbetrag  2.700,00'])
  })

  it('keeps only totals that agree', () => {
    expect(consistentTotals({ net: 100, vat: 19, vatRate: 19, gross: 119 })).toEqual({ net: 100, vat: 19, vatRate: 19, gross: 119 })
    expect(consistentTotals({ net: 100, vat: null, vatRate: null, gross: 107 })).toMatchObject({ vat: 7, vatRate: 7 })
    expect(consistentTotals({ net: 100, vat: null, vatRate: null, gross: 150 })).toEqual({ net: null, vat: null, vatRate: null, gross: null })
  })

  it('takes only clean fields from what OCR said', () => {
    expect(cleanQuoteFacts({ isQuote: true, net: 1000, gross: 1190, jobNumber: '4100300', quoteDate: '24.03.2026', quoteNumber: 'A 1' })).toMatchObject({
      isQuote: true,
      net: 1000,
      vat: 190,
      gross: 1190,
      jobNumber: '4100300',
      quoteDate: '2026-03-24',
    })
    expect(cleanQuoteFacts({ isQuote: true, net: 1000, gross: 5000, jobNumber: 'MA-12' })).toMatchObject({ net: null, gross: null, jobNumber: null })
    expect(cleanQuoteFacts({ isQuote: false, net: 1 }).isQuote).toBe(false)
    expect(cleanQuoteFacts('nonsense').isQuote).toBe(false)
  })
})

const q = (over: Partial<ProjectQuote>): ProjectQuote => ({ id: 'q', isQuote: true, inTotal: true, quoteNumber: null, jobNumber: '4100123', net: 1000, gross: 1190, ...over })

describe('what the project makes of its quotes', () => {
  it('adds up the quotes that count', () => {
    const quotes = [q({ id: 'a', net: 1000, gross: 1190 }), q({ id: 'b', net: 500.5, gross: 595.6 }), q({ id: 'c', inTotal: false, net: 9999, gross: 9999 })]
    expect(quoteTotals(quotes)).toEqual({ net: 1500.5, gross: 1785.6, count: 2 })
    expect(quoteTotals([])).toEqual({ net: null, gross: null, count: 0 })
  })

  it('leaves out the same quote twice, and one without a Vorgangsnummer', () => {
    const have = [q({ id: 'a', quoteNumber: '1269001' })]
    expect(startsInTotal({ docType: 'Angebot', quoteNumber: '1269001', jobNumber: '4100123', net: 1000, gross: 1190 }, have)).toEqual({ inTotal: false, reason: 'duplicate' })
    expect(startsInTotal({ docType: 'Angebot', quoteNumber: '1269002', jobNumber: null, net: 10, gross: 11.9 }, have)).toEqual({ inTotal: false, reason: 'noJobNumber' })
    expect(startsInTotal({ docType: 'Angebot', quoteNumber: '1269002', jobNumber: '4100123', net: 10, gross: 11.9 }, have)).toEqual({ inTotal: true, reason: null })
  })

  it('tells a supplement by what the document calls itself', () => {
    expect(isSupplement('Angebot Nachtrag NA 1')).toBe(true)
    expect(isSupplement('Angebot Nachtrag')).toBe(true)
    expect(isSupplement('Nachtragsangebot')).toBe(true)
    expect(isSupplement('Angebot')).toBe(false)
    expect(isSupplement(null)).toBe(false)
  })

  it('leaves a supplement out of the total, so it is not counted twice beside an add-on', () => {
    const facts = readQuoteText([['Angebot Nachtrag NA 1  1269003  Datum  15.05.2026', 'Baustellennr.  4100123', 'Gesamtbetrag  1.000,00  190,00  19,00%  1.190,00']])
    expect(startsInTotal(facts, [q({ id: 'a', quoteNumber: '1269001' })])).toEqual({ inTotal: false, reason: 'supplement' })
    expect(startsInTotal({ docType: 'Nachtragsangebot', quoteNumber: null, jobNumber: null, net: 2000, gross: 2380 }, [])).toEqual({ inTotal: false, reason: 'supplement' })
    // The same supplement attached twice is first of all a duplicate.
    expect(startsInTotal(facts, [q({ id: 'b', quoteNumber: '1269003' })])).toEqual({ inTotal: false, reason: 'duplicate' })
  })

  it('fills the price from the main quote alone while a supplement stays out, and takes it in once ticked', () => {
    const main = q({ id: 'a', quoteNumber: '1269001', net: 2700, gross: 3213 })
    const supplement = q({ id: 'b', quoteNumber: '1269003', net: 1000, gross: 1190, inTotal: false })
    expect(priceDecision({ price: null, priceFromQuote: null }, quoteTotals([main, supplement]).net)).toEqual({ change: true, price: 2700 })
    expect(priceDecision({ price: 2700, priceFromQuote: 2700 }, quoteTotals([main, { ...supplement, inTotal: true }]).net)).toEqual({ change: true, price: 3700 })
    // A project with nothing but a supplement gets no price from it.
    expect(priceDecision({ price: null, priceFromQuote: null }, quoteTotals([supplement]).net)).toEqual({ change: false })
  })

  it('fills an empty price with the net total, and follows the total while the price is still its figure', () => {
    expect(priceDecision({ price: null, priceFromQuote: null }, 2700)).toEqual({ change: true, price: 2700 })
    expect(priceDecision({ price: 2700, priceFromQuote: 2700 }, 3700)).toEqual({ change: true, price: 3700 })
    expect(priceDecision({ price: 2700, priceFromQuote: 2700 }, null)).toEqual({ change: true, price: null })
    expect(priceDecision({ price: 2700, priceFromQuote: 2700 }, 2700)).toEqual({ change: false })
  })

  it('never touches a price somebody typed, or confirmed', () => {
    expect(priceDecision({ price: 2500, priceFromQuote: null }, 2700)).toEqual({ change: false })
    expect(priceDecision({ price: 2500, priceFromQuote: 2700 }, 3000)).toEqual({ change: false })
    expect(priceDecision({ price: null, priceFromQuote: null }, null)).toEqual({ change: false })
  })

  it('fills an empty Projektnummer only from a number its quotes agree on', () => {
    expect(jobNumberFromQuotes({ jobNumber: null }, [q({ jobNumber: '4100123' }), q({ jobNumber: '4100123' })])).toBe('4100123')
    expect(jobNumberFromQuotes({ jobNumber: null }, [q({ jobNumber: '4100123' }), q({ jobNumber: '4100999' })])).toBeNull()
    expect(jobNumberFromQuotes({ jobNumber: '4100555' }, [q({ jobNumber: '4100123' })])).toBeNull()
  })

  it('tells when a quote’s number is not the project’s', () => {
    expect(jobNumberDiffers('4100555', '4100123')).toBe(true)
    expect(jobNumberDiffers('4100123', '4100123')).toBe(false)
    expect(jobNumberDiffers(null, '4100123')).toBe(false)
  })
})
