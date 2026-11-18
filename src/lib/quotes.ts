/**
 * Reading a quote (Angebot) out of a PDF's words: whether the document is one,
 * its totals — net, VAT, gross, as printed — the quote's own number, the
 * Vorgangsnummer (the job's number, which is the project's Projektnummer) and
 * the quote's date. Plus the rules for what a project does with what was read:
 * the total across its quotes, and when the price and the Projektnummer are
 * filled from them.
 *
 * Pure: the PDF is turned into lines elsewhere (src/lib/quote-pdf.ts), the
 * database is written elsewhere (src/lib/quotes-db.ts). Tested with invented
 * quote texts in tests/unit/quotes.test.ts.
 *
 * A line is the words of one row of the page, left to right, with two spaces
 * where the page leaves a gap between them — that gap is what tells a label
 * from its amount when the row is a table's.
 */

/** Raised when the rules change, so the backfill reads the files again. */
export const QUOTE_READER_VERSION = 1

/** Fewer letters than this on all pages together: a scan, or a photo — nothing to read. */
const MIN_TEXT_CHARS = 40

/** One piece of text on a page, where the PDF put it (PDF units, y upwards). */
export type PageTextItem = { str: string; x: number; y: number; width: number; height: number }

/**
 * The rows of a page from its pieces of text: pieces at the same height make
 * one row, left to right; a gap between two pieces becomes two spaces.
 */
export function linesFromItems(items: PageTextItem[]): string[] {
  const pieces = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: { y: number; items: PageTextItem[] }[] = []
  for (const piece of pieces) {
    const tolerance = Math.max(2, (piece.height || 8) * 0.4)
    const row = rows.find((r) => Math.abs(r.y - piece.y) <= tolerance)
    if (row) row.items.push(piece)
    else rows.push({ y: piece.y, items: [piece] })
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      let line = ''
      let end: number | null = null
      for (const piece of row.items.sort((a, b) => a.x - b.x)) {
        if (end !== null) line += piece.x - end > 1 ? '  ' : ''
        line += piece.str
        end = piece.x + piece.width
      }
      return tidyLine(line)
    })
    .filter(Boolean)
}

/** Runs of spaces kept as the column gap they are; single spaces stay words apart. */
function tidyLine(line: string): string {
  return line.replace(/ /g, ' ').replace(/[ \t]{2,}/g, '  ').trim()
}

/** Whether the pages carry words at all, or are pictures of paper. */
export function hasTextLayer(pages: string[][]): boolean {
  return pages.flat().join('').replace(/\s/g, '').length >= MIN_TEXT_CHARS
}

// ── Amounts and dates ─────────────────────────────────────────────────

/** A German amount: "1.234,56", "234,00", "-12,50" — never a percentage. */
const AMOUNT = /(?<![\d.,])-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?![\d%]|\s*%)/g

/** "1.234,56" → 1234.56; null when it is no amount. */
export function parseAmount(text: string): number | null {
  const m = text.trim().match(/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/)
  if (!m) return null
  return Number(m[0].replace(/\./g, '').replace(',', '.'))
}

function amountsIn(text: string): number[] {
  return [...text.matchAll(AMOUNT)].map((m) => parseAmount(m[0])).filter((n): n is number => n !== null)
}

/** "19,00%", "19 %", "7%" → 19 / 7 */
function rateIn(text: string): number | null {
  const m = text.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/)
  return m ? Number(m[1].replace(',', '.')) : null
}

/** "24.03.2026" or "24.03.26" → "2026-03-24"; null when it is no real day. */
export function parseGermanDate(text: string): string | null {
  const m = text.match(/(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  if (year < 2000 || year > 2100) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const cents = (n: number) => Math.round(n * 100) / 100
/** Within a few cents: what rounding per line leaves on a printed total. */
const near = (a: number, b: number) => Math.abs(a - b) <= 0.05
/** The VAT rates a German quote is written with: today's, the reduced one, and 2020's. */
const RATES = [19, 7, 16, 5]
/** The rate that turns this net into this gross, or null. */
function rateBetween(net: number, gross: number): number | null {
  if (net <= 0) return null
  if (near(net, gross)) return 0
  return RATES.find((r) => Math.abs(net * (1 + r / 100) - gross) <= Math.max(0.05, net * 0.0005)) ?? null
}

// ── What the document calls itself ────────────────────────────────────

/**
 * The page head an accounting program prints on every page:
 * "Angebot  4711001  Datum  24.03.2026" — the document's kind, its own
 * number, its date. The same head says "Rechnung", "Bestätigung" … on the
 * program's other documents.
 */
const DOC_HEAD =
  /^([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\- ]{2,40}?(?:\s+NA\s*\d+)?)\s{2,}([A-Z]{0,4}\d{3,12})\s{2,}Datum:?\s{2,}(\d{1,2}\.\d{1,2}\.\d{2,4})/
const QUOTE_WORD = /angebot/i
/** A page whose title is the word: "Angebot", "Angebot Nr. 4711", "Nachtragsangebot". Not "Angebotssumme". */
const QUOTE_TITLE = /^(?:nachtrags)?angebot(?![a-zäöüß])/i
/** Titles of documents that are not quotes, however often they say "Angebot". */
const OTHER_TITLE = /^(?:(?:schluss|abschlags|teil|teilschluss)?rechnung|auftragsbest(?:ä|ae)tigung|best(?:ä|ae)tigung|gutschrift|stornobeleg|lieferschein|mahnung|aufmaß)(?![a-zäöüß])/i
const QUOTE_NO = /angebots?[- ]?(?:nr\.?|nummer)\s*:?\s*([A-Z]{0,4}[-/]?\d[\d\-/.]{2,20})/i

/**
 * The Vorgangsnummer: the job's number, which the accounting program prints
 * as "Baustellennr." on the quote and the cover letter as "Vorgang-Nr." —
 * the project's Projektnummer. Labelled so, and digits only: a supplier's
 * "Vorgang: 123456789" or "Vorgang: MA123/24" is an order number of theirs.
 */
const JOB_NO = /(?:baustellen[- ]?(?:nr\.?|nummer)|vorgangs?[- ]?(?:nr\.?|nummer))\s*:?\s+(\d{4,12})(?!\d|[.,/]\d)/i
const DATE_LABEL = /datum(?:\s*\/\s*seite)?\s*:?\s+(\d{1,2}\.\d{1,2}\.\d{2,4})/i

// ── Totals ────────────────────────────────────────────────────────────

/** The total row of the program's table: "Gesamtbetrag  234.866,95  44.624,72  19,00%  279.491,67". */
const TOTAL_ROW = /^(?:gesamtbetrag|gesamtsumme|endbetrag)\s*:?$/i

type Totals = { net: number | null; vat: number | null; vatRate: number | null; gross: number | null }
const NO_TOTALS: Totals = { net: null, vat: null, vatRate: null, gross: null }

/** Net, VAT and gross from three amounts and a rate in one row, whichever order they stand in. */
function totalsFromRow(amounts: number[], rate: number | null): Totals | null {
  if (amounts.length !== 3) return null
  for (const gross of amounts) {
    const [a, b] = amounts.filter((n) => n !== gross)
    if (a === undefined || b === undefined || !near(a + b, gross)) continue
    const net = Math.max(a, b)
    const vat = Math.min(a, b)
    return { net: cents(net), vat: cents(vat), vatRate: rate ?? rateBetween(net, gross), gross: cents(gross) }
  }
  return null
}

function tableTotals(pages: string[][]): Totals | null {
  let found: Totals | null = null
  for (const line of pages.flat()) {
    const [head, ...rest] = line.split('  ')
    if (!TOTAL_ROW.test(head.trim())) continue
    const tail = rest.join('  ')
    const totals = totalsFromRow(amountsIn(tail), rateIn(tail))
    // The last one on the paper: a cover letter's sums come before the quote's.
    if (totals) found = totals
  }
  return found
}

const VAT_LABEL =
  /^(?:zzgl\.?|zuzügl\.?|zuzüglich|\+)?\s*(?:(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:mwst|ust|mehrwertsteuer|umsatzsteuer)|(?:mwst|ust|mehrwertsteuer|umsatzsteuer)\.?\s*\(?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%)/i
const NET_LABEL =
  /^(?:(?:gesamt[- ]?)?netto(?:betrag|summe|preis|wert)?(?![a-zäöüß])|(?:summe|gesamtsumme|angebotssumme|auftragssumme|endsumme|gesamtbetrag|gesamtpreis|zwischensumme)(?![a-zäöüß]).{0,25}?(?:netto|(?:ohne|exkl\.?|exklusive|zzgl\.?|zuzügl\.?)\s*(?:mwst|ust|umsatzsteuer|mehrwertsteuer)))/i
const GROSS_LABEL =
  /^(?:brutto(?:betrag|summe|preis)?(?![a-zäöüß])|(?:gesamt|end|angebots|rechnungs)?(?:betrag|summe),?\s*brutto|endbetrag(?![a-zäöüß])|(?:summe|gesamtsumme|angebotssumme|auftragssumme|endsumme|gesamtbetrag|gesamtpreis)(?![a-zäöüß]).{0,25}?(?:brutto|(?:inkl\.?|incl\.?|einschl\.?|einschließlich|inklusive)\s*(?:\d{1,2}\s*%\s*)?(?:mwst|ust|steuer|umsatzsteuer|mehrwertsteuer)))/i

/**
 * The amount a label stands for: in its own column after the label, or in
 * one of the next few columns ("Summe netto:  EUR  12.345,00").
 */
function amountAfter(columns: string[], index: number, label: RegExp): number | null {
  const own = amountsIn(columns[index].replace(label, ''))
  if (own.length) return own[own.length - 1]
  for (const column of columns.slice(index + 1, index + 4)) {
    const found = amountsIn(column)
    if (found.length) return found[0]
    // Only currency and dots may stand between a label and its amount.
    if (!/^[\s.:_€-]*$/.test(column.replace(/eur(o)?/gi, ''))) return null
  }
  return null
}

/** Totals from their labels — the bottom-most of each, as a quote ends with its sums. */
function labelledTotals(pages: string[][]): Totals {
  const found: Totals = { ...NO_TOTALS }
  for (const line of pages.flat()) {
    const columns = line.split('  ').map((c) => c.trim())
    columns.forEach((column, i) => {
      const vatMatch = column.match(VAT_LABEL)
      if (vatMatch) {
        const amount = amountAfter(columns, i, VAT_LABEL)
        if (amount !== null) {
          found.vat = amount
          found.vatRate = Number((vatMatch[1] ?? vatMatch[2]).replace(',', '.'))
        }
        return
      }
      if (NET_LABEL.test(column)) {
        const amount = amountAfter(columns, i, NET_LABEL)
        if (amount !== null) found.net = amount
        return
      }
      if (GROSS_LABEL.test(column)) {
        const amount = amountAfter(columns, i, GROSS_LABEL)
        if (amount !== null) found.gross = amount
      }
    })
  }
  return consistentTotals(found)
}

/**
 * Only figures that agree with each other: net + VAT = gross, or gross the
 * net at a German rate. The missing third is worked out; figures that do not
 * add up are dropped rather than guessed at.
 */
export function consistentTotals(t: Totals): Totals {
  const ok = (n: number | null): n is number => n !== null && Number.isFinite(n) && n >= 0
  const { net, vat, gross } = t
  if (ok(net) && ok(gross) && ok(vat) && near(net + vat, gross)) {
    return { net: cents(net), vat: cents(vat), vatRate: t.vatRate ?? rateBetween(net, gross), gross: cents(gross) }
  }
  if (ok(net) && ok(gross)) {
    const rate = rateBetween(net, gross)
    if (rate === null) return NO_TOTALS
    return { net: cents(net), vat: cents(gross - net), vatRate: rate, gross: cents(gross) }
  }
  if (ok(net) && ok(vat)) {
    const rate = t.vatRate ?? null
    if (rate !== null && Math.abs(net * (rate / 100) - vat) > Math.max(0.05, net * 0.0005)) return { ...NO_TOTALS, net: cents(net) }
    return { net: cents(net), vat: cents(vat), vatRate: rate, gross: cents(net + vat) }
  }
  if (ok(gross) && ok(vat) && vat < gross) return { net: cents(gross - vat), vat: cents(vat), vatRate: t.vatRate ?? null, gross: cents(gross) }
  if (ok(net)) return { ...NO_TOTALS, net: cents(net) }
  if (ok(gross)) return { ...NO_TOTALS, gross: cents(gross) }
  return NO_TOTALS
}

// ── The whole reading ─────────────────────────────────────────────────

export type QuoteFacts = Totals & {
  /** Whether the document is a quote. */
  isQuote: boolean
  /** The word the document calls itself by ("Angebot", "Angebot Nachtrag", "Rechnung" …), when it says. */
  docType: string | null
  /** The program's page head and total row ("table"), or labels found in the text ("labels"). */
  layout: 'table' | 'labels' | null
  /** The quote's own number. */
  quoteNumber: string | null
  /** The Vorgangsnummer — the job's number, the project's Projektnummer. */
  jobNumber: string | null
  /** The quote's date, "YYYY-MM-DD". */
  quoteDate: string | null
}

export const NOT_A_QUOTE: QuoteFacts = { ...NO_TOTALS, isQuote: false, docType: null, layout: null, quoteNumber: null, jobNumber: null, quoteDate: null }

/** Reads the lines of a PDF's pages. Decides from the words alone, never from the file's name. */
export function readQuoteText(pages: string[][]): QuoteFacts {
  if (!hasTextLayer(pages)) return NOT_A_QUOTE
  const lines = pages.flat()
  const all = lines.join('\n')

  let head: RegExpMatchArray | null = null
  for (const line of lines) {
    head = line.match(DOC_HEAD)
    // A cover letter's head names a number ("Vorgang-Nr.  4100001  Datum: …"), not a kind of document.
    if (head && /(?:nr\.?|nummer)$/i.test(head[1].trim())) head = null
    if (head) break
  }
  const jobNumber = all.match(JOB_NO)?.[1] ?? null

  if (head) {
    const docType = head[1].replace(/\s+/g, ' ').trim()
    if (!QUOTE_WORD.test(docType)) return { ...NOT_A_QUOTE, docType, jobNumber }
    const totals = tableTotals(pages) ?? labelledTotals(pages)
    return {
      ...totals,
      isQuote: true,
      docType,
      layout: 'table',
      quoteNumber: head[2],
      jobNumber,
      quoteDate: parseGermanDate(head[3]),
    }
  }

  // Any other quote: its title says so near the top of its first pages, and it carries a sum.
  const top = pages.slice(0, 2).flatMap((page) => page.slice(0, 40))
  const titles = top.map((line) => line.split('  ')[0].trim())
  const otherAt = titles.findIndex((t) => OTHER_TITLE.test(t))
  const titleAt = titles.findIndex((t) => QUOTE_TITLE.test(t) && t.length <= 80)
  if (titleAt < 0 || (otherAt >= 0 && otherAt < titleAt)) return { ...NOT_A_QUOTE, docType: otherAt >= 0 ? titles[otherAt] : null, jobNumber }
  const totals = labelledTotals(pages)
  if (totals.net === null && totals.gross === null) return { ...NOT_A_QUOTE, jobNumber }
  const title = titles[titleAt]
  const titleNumber = title.match(/^(?:nachtrags)?angebot\s+(?:nr\.?\s*)?([A-Z]{0,4}[-/]?\d[\d\-/.]{2,20})/i)?.[1]
  const date = all.match(DATE_LABEL)?.[1]
  return {
    ...totals,
    isQuote: true,
    docType: /^nachtrags/i.test(title) ? 'Nachtragsangebot' : 'Angebot',
    layout: 'labels',
    quoteNumber: all.match(QUOTE_NO)?.[1] ?? titleNumber ?? null,
    jobNumber,
    quoteDate: date ? parseGermanDate(date) : null,
  }
}

/**
 * What a reader that looks at the pages (OCR) said, made safe: only fields of
 * the right shape, and totals only when they add up — the same rules as for text.
 */
export function cleanQuoteFacts(raw: unknown): QuoteFacts {
  if (!raw || typeof raw !== 'object') return NOT_A_QUOTE
  const r = raw as Record<string, unknown>
  if (r.isQuote !== true) return NOT_A_QUOTE
  const num = (v: unknown): number | null => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v !== 'string' || !v.trim()) return null
    return parseAmount(v) ?? (Number.isFinite(Number(v)) ? Number(v) : null)
  }
  const str = (v: unknown, max = 40) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null)
  const jobNumber = str(r.jobNumber)
  const date = str(r.quoteDate)
  return {
    ...consistentTotals({ net: num(r.net), vat: num(r.vat), vatRate: num(r.vatRate), gross: num(r.gross) }),
    isQuote: true,
    docType: str(r.docType) ?? 'Angebot',
    layout: null,
    quoteNumber: str(r.quoteNumber),
    jobNumber: jobNumber && /^\d{4,12}$/.test(jobNumber) ? jobNumber : null,
    quoteDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : date ? parseGermanDate(date) : null,
  }
}

// ── What the project makes of its quotes ─────────────────────────────

export type ProjectQuote = {
  id: string
  isQuote: boolean
  inTotal: boolean
  quoteNumber: string | null
  jobNumber: string | null
  net: number | null
  gross: number | null
}

/** Why the reading itself left a quote out of the total. */
export const QUOTE_LEFT_OUT = ['duplicate', 'supplement', 'noJobNumber'] as const
export type QuoteLeftOut = (typeof QUOTE_LEFT_OUT)[number]

/** A supplement to the order ("Angebot Nachtrag NA 1", "Nachtragsangebot"), by what the document calls itself. */
export function isSupplement(docType: string | null): boolean {
  return Boolean(docType && /nachtrag/i.test(docType))
}

/**
 * Whether a newly read quote counts towards the project's total by itself.
 * Not when the project holds the same quote already (the same number, the
 * same file twice); not when it is a supplement — the office also enters a
 * Nachtrag as a Zusatzleistung, and counted here as well it would be in the
 * order value twice; and not when it carries no Vorgangsnummer — the office's
 * own quotes always do; one without is most likely a supplier's quote to the
 * office, which is a cost, not an order. The office can always change it.
 */
export function startsInTotal(
  facts: Pick<QuoteFacts, 'docType' | 'quoteNumber' | 'jobNumber' | 'net' | 'gross'>,
  others: ProjectQuote[]
): { inTotal: boolean; reason: QuoteLeftOut | null } {
  const twin = others.find(
    (o) =>
      o.isQuote &&
      ((facts.quoteNumber !== null && o.quoteNumber === facts.quoteNumber) ||
        (facts.quoteNumber === null && o.quoteNumber === null && facts.net !== null && o.net === facts.net && o.gross === facts.gross))
  )
  if (twin) return { inTotal: false, reason: 'duplicate' }
  if (isSupplement(facts.docType)) return { inTotal: false, reason: 'supplement' }
  if (!facts.jobNumber) return { inTotal: false, reason: 'noJobNumber' }
  return { inTotal: true, reason: null }
}

/** The sums across a project's quotes that count. Null where none of them has that figure. */
export function quoteTotals(quotes: ProjectQuote[]): { net: number | null; gross: number | null; count: number } {
  const counted = quotes.filter((q) => q.isQuote && q.inTotal && (q.net !== null || q.gross !== null))
  const sum = (pick: (q: ProjectQuote) => number | null) => {
    const values = counted.map(pick).filter((n): n is number => n !== null)
    return values.length ? cents(values.reduce((a, b) => a + b, 0)) : null
  }
  return { net: sum((q) => q.net), gross: sum((q) => q.gross), count: counted.length }
}

/**
 * What becomes of the project's price. It follows the quotes' net total as
 * long as it is empty or still the figure the quotes put there
 * (`priceFromQuote`) — and stops the moment somebody types a price, or
 * confirms the one that is there. The basis is net, as the price taken from
 * Trello's "Auftragswert" is.
 */
export function priceDecision(
  project: { price: number | null; priceFromQuote: number | null },
  totalNet: number | null
): { change: false } | { change: true; price: number | null } {
  const ours = project.price === null || (project.priceFromQuote !== null && near(project.price, project.priceFromQuote))
  if (!ours) return { change: false }
  const next = totalNet !== null && totalNet > 0 ? totalNet : null
  if (next === null && project.price === null) return { change: false }
  if (next !== null && project.price !== null && near(project.price, next)) return { change: false }
  return { change: true, price: next }
}

/**
 * The Projektnummer a project takes from its quotes: only while it has none,
 * and only a number its quotes agree on. Otherwise null — the quotes' number
 * is then shown beside the project's as a hint where they differ.
 */
export function jobNumberFromQuotes(project: { jobNumber: string | null }, quotes: ProjectQuote[]): string | null {
  if (project.jobNumber) return null
  const numbers = new Set(quotes.filter((q) => q.isQuote && q.jobNumber).map((q) => q.jobNumber!))
  return numbers.size === 1 ? [...numbers][0] : null
}

/** Whether a quote's Vorgangsnummer disagrees with the project's Projektnummer. */
export function jobNumberDiffers(projectJobNumber: string | null, quoteJobNumber: string | null): boolean {
  return Boolean(projectJobNumber && quoteJobNumber && projectJobNumber.trim() !== quoteJobNumber.trim())
}
