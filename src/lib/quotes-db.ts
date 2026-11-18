import type { PrismaClient } from '@/generated/prisma/client'
import { Prisma } from '@/generated/prisma/client'
import { pdfLines, looksLikePdf } from './quote-pdf'
import {
  QUOTE_READER_VERSION,
  hasTextLayer,
  jobNumberFromQuotes,
  priceDecision,
  quoteTotals,
  readQuoteText,
  startsInTotal,
  type ProjectQuote,
  type QuoteFacts,
  type QuoteLeftOut,
} from './quotes'

/**
 * Reading a project's PDFs for quotes, and what the project takes from them:
 * the rows in DocumentQuote, the price (the quotes' net total) and the
 * Projektnummer (their Vorgangsnummer) — each only while it is empty or
 * still the figure the quotes put there. What somebody typed is never
 * touched; every change is in the audit log.
 *
 * Runs in the app (upload, Trello's files) and in the backfill script
 * (scripts/quote-backfill.mjs), so nothing here needs Next.js: the database
 * client, the file reader and the OCR step come from the caller.
 */

type Db = PrismaClient

export type QuoteReadDeps = {
  db: Db
  /** The stored file's bytes by its storage key. */
  readFile: (key: string) => Promise<Buffer | Uint8Array>
  /** Who the change is written down for: the uploader, the import's user — null for the system. */
  userId: string | null
  /** Pages without words, looked at by OpenAI — only when switched on (src/lib/quote-ocr.ts). */
  ocr?: ((data: Uint8Array) => Promise<QuoteFacts | null>) | null
  /** Read again even when the reading is current. Never past a confirmed one. */
  force?: boolean
  /**
   * Leave the project as it is: the backfill reads all of a project's files
   * first and then applies them once, so the outcome does not hang on the
   * order the files are read in.
   */
  deferProject?: boolean
}

export type QuoteReadResult = {
  kind: 'QUOTE' | 'OTHER' | 'SCAN' | 'FAILED'
  /** Whether the file was read now (not a current or confirmed reading left as it was). */
  read: boolean
  projectId: string
  /** What the project took from its quotes, when they were looked at. */
  applied: QuoteApplied | null
} | null

/** Whether a document is a PDF by its type or its name — Trello's often come as "octet-stream". */
export function isPdfDocument(doc: { mimeType: string; filename: string }): boolean {
  return doc.mimeType === 'application/pdf' || /\.pdf$/i.test(doc.filename)
}

const dec = (n: number | null) => (n === null ? null : new Prisma.Decimal(n.toFixed(2)))
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d))
const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null)

async function writeAudit(
  db: Db,
  e: { userId: string | null; action: string; projectId: string; field?: string; oldValue?: string | null; newValue?: string | null }
) {
  try {
    await db.auditLog.create({
      data: { userId: e.userId, action: e.action, entity: 'Project', entityId: e.projectId, field: e.field, oldValue: e.oldValue ?? undefined, newValue: e.newValue ?? undefined },
    })
  } catch (err) {
    console.error('audit log failed', err)
  }
}

/** The quotes of a project as the rules see them. */
export async function projectQuotes(db: Db, projectId: string): Promise<ProjectQuote[]> {
  const rows = await db.documentQuote.findMany({
    where: { kind: 'QUOTE', document: { projectId } },
    orderBy: [{ quoteDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, inTotal: true, quoteNumber: true, jobNumber: true, net: true, gross: true },
  })
  return rows.map((r) => ({ id: r.id, isQuote: true, inTotal: r.inTotal, quoteNumber: r.quoteNumber, jobNumber: r.jobNumber, net: num(r.net), gross: num(r.gross) }))
}

/**
 * Reads one document, when it is a PDF, and writes what it found. A reading
 * the office confirmed is never read again; one of the reader's current
 * version only with `force`. Never throws for a file that will not read —
 * that is a FAILED row.
 */
export async function readDocumentQuote(documentId: string, deps: QuoteReadDeps): Promise<QuoteReadResult> {
  const { db } = deps
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: { id: true, projectId: true, filename: true, mimeType: true, path: true, quote: true },
  })
  if (!doc || !isPdfDocument(doc)) return null
  const before = doc.quote
  const left = before ? { kind: before.kind, read: false, projectId: doc.projectId, applied: null } : null
  if (before?.confirmedAt) return left
  if (before && before.version >= QUOTE_READER_VERSION && !deps.force) return left

  let kind: 'QUOTE' | 'OTHER' | 'SCAN' | 'FAILED'
  let facts: QuoteFacts | null = null
  let method = 'text'
  try {
    const data = new Uint8Array(await deps.readFile(doc.path))
    if (!looksLikePdf(data)) throw new Error('not a pdf')
    const { pages } = await pdfLines(data)
    if (hasTextLayer(pages)) {
      facts = readQuoteText(pages)
      kind = facts.isQuote ? 'QUOTE' : 'OTHER'
    } else if (deps.ocr) {
      method = 'ocr'
      facts = await deps.ocr(data).catch(() => null)
      kind = facts === null ? 'SCAN' : facts.isQuote ? 'QUOTE' : 'OTHER'
    } else {
      kind = 'SCAN'
    }
  } catch {
    kind = 'FAILED'
  }

  const quote = kind === 'QUOTE' && facts ? facts : null
  // A quote read again keeps what the office decided about the total; a new one starts by the rules.
  const total =
    quote && before?.kind === 'QUOTE'
      ? { inTotal: before.inTotal, reason: before.excludedReason as QuoteLeftOut | null }
      : quote
        ? startsInTotal(quote, (await projectQuotes(db, doc.projectId)).filter((q) => q.id !== before?.id))
        : { inTotal: false, reason: null }
  const data = {
    kind,
    method,
    version: QUOTE_READER_VERSION,
    docType: facts?.docType ?? null,
    quoteNumber: quote?.quoteNumber ?? null,
    jobNumber: quote?.jobNumber ?? null,
    quoteDate: day(quote?.quoteDate ?? null),
    net: dec(quote?.net ?? null),
    vat: dec(quote?.vat ?? null),
    vatRate: dec(quote?.vatRate ?? null),
    gross: dec(quote?.gross ?? null),
    inTotal: total.inTotal,
    excludedReason: total.reason,
  }
  await db.documentQuote.upsert({ where: { documentId: doc.id }, create: { documentId: doc.id, ...data }, update: data })

  if (quote) {
    // A quote is the office's paper: prices for the customer, never on the crew's screens.
    await db.document.updateMany({ where: { id: doc.id, visibleToCrew: true }, data: { visibleToCrew: false } })
    if (before?.kind !== 'QUOTE') await writeAudit(db, { userId: deps.userId, action: 'project.quote.read', projectId: doc.projectId, newValue: doc.filename })
  }
  const applied = (quote || before?.kind === 'QUOTE') && !deps.deferProject ? await applyQuotesToProject(db, doc.projectId, deps.userId) : null
  return { kind, read: true, projectId: doc.projectId, applied }
}

export type QuoteApplied = { priceChanged: boolean; jobNumberFilled: boolean; jobNumberTaken: boolean }

/**
 * What the project takes from its quotes: the price follows their net total
 * while it is empty or still their figure (`priceFromQuote`); the
 * Projektnummer is filled from their Vorgangsnummer while it is empty and no
 * other project holds that number.
 */
export async function applyQuotesToProject(db: Db, projectId: string, userId: string | null): Promise<QuoteApplied> {
  const result: QuoteApplied = { priceChanged: false, jobNumberFilled: false, jobNumberTaken: false }
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { price: true, priceFromQuote: true, jobNumber: true },
  })
  if (!project) return result
  const quotes = await projectQuotes(db, projectId)

  const decision = priceDecision({ price: num(project.price), priceFromQuote: num(project.priceFromQuote) }, quoteTotals(quotes).net)
  if (decision.change) {
    // Only while it is still what it was when looked at: a price typed meanwhile wins.
    const done = await db.project.updateMany({
      where: { id: projectId, price: project.price === null ? null : { equals: project.price } },
      data: { price: dec(decision.price), priceFromQuote: dec(decision.price) },
    })
    if (done.count) {
      result.priceChanged = true
      await writeAudit(db, {
        userId,
        action: 'project.quote.price',
        projectId,
        field: 'price',
        oldValue: project.price === null ? null : String(project.price),
        newValue: decision.price === null ? null : decision.price.toFixed(2),
      })
    }
  }

  const number = jobNumberFromQuotes(project, quotes)
  if (number) {
    const holder = await db.project.findUnique({ where: { jobNumber: number }, select: { id: true } })
    if (holder) {
      result.jobNumberTaken = true
    } else {
      try {
        const done = await db.project.updateMany({ where: { id: projectId, jobNumber: null }, data: { jobNumber: number, jobNumberFromQuote: number } })
        if (done.count) {
          result.jobNumberFilled = true
          await writeAudit(db, { userId, action: 'project.jobNumber', projectId, field: 'jobNumber', oldValue: null, newValue: number })
        }
      } catch (e) {
        // Taken by another project between the look and the write: the uniqueness rule holds.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
        result.jobNumberTaken = true
      }
    }
  }
  return result
}

/** The PDFs that still want reading: none yet, or of an older reader — never a confirmed one. */
export async function pdfsToRead(db: Db, where: Prisma.DocumentWhereInput = {}) {
  return db.document.findMany({
    where: {
      ...where,
      OR: [{ mimeType: 'application/pdf' }, { filename: { endsWith: '.pdf', mode: 'insensitive' } }],
      AND: [{ OR: [{ quote: { is: null } }, { quote: { is: { version: { lt: QUOTE_READER_VERSION }, confirmedAt: null } } }] }],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
}
