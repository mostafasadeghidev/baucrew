#!/usr/bin/env node
// Reads the PDFs that are already on the projects for quotes (Angebote) — the
// files that came before the reading existed. New files are read by the app
// itself, on upload and when Trello's files are fetched (src/lib/quotes-db.ts).
//
//   npx tsx --env-file=.env scripts/quote-backfill.mjs            dry run: writes NOTHING
//   npx tsx --env-file=.env scripts/quote-backfill.mjs --apply    reads and writes
//   … --apply --force     reads again what was read before (never a confirmed one)
//
// Safe to run twice: a file read by the current reader is skipped, one the
// office confirmed or corrected is never touched, and the project's price and
// Projektnummer are filled only while empty (or still the quotes' own figure).
// Scans go to OpenAI only with QUOTE_OCR=1 — off unless set.
//
// Prints counts only: no file names, customers or amounts. Needs DATABASE_URL
// and FILE_STORAGE_DIR (or ./storage). Run through tsx: it imports the
// TypeScript reader itself.

import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '../src/generated/prisma/client.ts'
import { PrismaPg } from '@prisma/adapter-pg'
import { applyQuotesToProject, pdfsToRead, readDocumentQuote } from '../src/lib/quotes-db.ts'
import { pdfLines, looksLikePdf } from '../src/lib/quote-pdf.ts'
import { hasTextLayer, jobNumberDiffers, readQuoteText, QUOTE_READER_VERSION } from '../src/lib/quotes.ts'
import { quoteOcr } from '../src/lib/quote-ocr.ts'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const force = args.includes('--force')
const storage = path.resolve(process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'storage'))

/** A stored file by its key, never outside the storage folder. */
async function stored(key) {
  const abs = path.resolve(storage, key)
  if (!abs.startsWith(storage + path.sep)) throw new Error('invalid storage key')
  return readFile(abs)
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const count = {}
const add = (key, n = 1) => (count[key] = (count[key] ?? 0) + n)

try {
  const docs = force
    ? await db.document.findMany({
        where: {
          OR: [{ mimeType: 'application/pdf' }, { filename: { endsWith: '.pdf', mode: 'insensitive' } }],
          AND: [{ OR: [{ quote: { is: null } }, { quote: { is: { confirmedAt: null } } }] }],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
    : await pdfsToRead(db)
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} · reader v${QUOTE_READER_VERSION} · ${docs.length} PDF(s) to read`)

  const before = new Map(
    (await db.project.findMany({ select: { id: true, price: true, jobNumber: true } })).map((p) => [p.id, { price: p.price, jobNumber: p.jobNumber }])
  )

  if (!apply) {
    for (const { id } of docs) {
      const doc = await db.document.findUnique({ where: { id }, select: { path: true } })
      try {
        const data = new Uint8Array(await stored(doc.path))
        if (!looksLikePdf(data)) throw new Error('not a pdf')
        const { pages } = await pdfLines(data)
        if (!hasTextLayer(pages)) add('SCAN')
        else {
          const facts = readQuoteText(pages)
          add(facts.isQuote ? 'QUOTE' : 'OTHER')
          if (facts.isQuote && facts.net !== null) add('  with net')
          if (facts.isQuote && facts.jobNumber) add('  with Vorgangsnummer')
        }
      } catch {
        add('FAILED')
      }
    }
    console.log(count)
    console.log('Nothing written. Run again with --apply.')
  } else {
    const ocr = quoteOcr()
    if (ocr) console.log('QUOTE_OCR=1: scans are sent to OpenAI.')
    const touched = new Set()
    for (const { id } of docs) {
      const result = await readDocumentQuote(id, { db, readFile: stored, userId: null, ocr, force, deferProject: true })
      if (!result) continue
      add(result.read ? result.kind : `${result.kind} (left as it was)`)
      if (result.kind === 'QUOTE') touched.add(result.projectId)
    }
    // Then each project once, all of its quotes read: four quotes with four Vorgangsnummern
    // give it none, whichever was read first.
    for (const projectId of touched) await applyQuotesToProject(db, projectId, null)

    const projects = await db.project.findMany({
      where: { id: { in: [...touched] } },
      select: { id: true, price: true, priceFromQuote: true, jobNumber: true, jobNumberFromQuote: true, links: { where: { system: 'wattro' }, select: { id: true } } },
    })
    const quotes = await db.documentQuote.findMany({
      where: { kind: 'QUOTE', document: { projectId: { in: [...touched] } } },
      select: { jobNumber: true, net: true, document: { select: { projectId: true } } },
    })
    const jobOf = new Map(projects.map((p) => [p.id, p.jobNumber]))
    for (const p of projects) {
      const was = before.get(p.id)
      if (was?.price === null && p.price !== null) add('price filled (was empty)')
      if (was?.jobNumber === null && p.jobNumber !== null) {
        add('Projektnummer filled (was empty)')
        if (p.links.length) add('  of them already in Wattro under the app number')
      }
    }
    add('quotes with net', quotes.filter((q) => q.net !== null).length)
    add('quotes whose Vorgangsnummer differs from the project', quotes.filter((q) => jobNumberDiffers(jobOf.get(q.document.projectId) ?? null, q.jobNumber)).length)
    add('projects with quotes', touched.size)
    console.log(count)
  }
} finally {
  await db.$disconnect()
}
