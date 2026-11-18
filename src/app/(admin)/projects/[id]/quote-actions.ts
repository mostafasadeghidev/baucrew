'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { canViewFinancials, requireManagement } from '@/lib/authz'
import type { CurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { parseAmount } from '@/lib/amount'
import { normalizeJobNumber } from '@/lib/job-number'
import { readStoredFile } from '@/lib/file-storage'
import { applyQuotesToProject, isPdfDocument, readDocumentQuote } from '@/lib/quotes-db'
import { quoteOcr } from '@/lib/quote-ocr'
import { consistentTotals, parseGermanDate } from '@/lib/quotes'
import { pushProjectInBackground } from '@/lib/wattro/project-push'

/**
 * The office's word on what was read in a project's quotes (src/lib/quotes-db.ts):
 * whether one counts towards the total, that it was read right, what it
 * really says, that it is no quote at all — and that the price and the
 * Projektnummer the quotes filled in are the right ones. Amounts are money:
 * only for those who may see it. Every change is in the audit log.
 */

type Result = { error?: 'forbidden' | 'notFound' | 'invalid' }

async function moneyUser(): Promise<CurrentUser | null> {
  const user = await requireManagement()
  return canViewFinancials(user) ? user : null
}

async function quoteOf(id: string) {
  return db.documentQuote.findUnique({ where: { id }, include: { document: { select: { projectId: true, filename: true } } } })
}

async function settle(projectId: string, userId: string) {
  const applied = await applyQuotesToProject(db, projectId, userId)
  if (applied.jobNumberFilled) pushProjectInBackground(projectId, 'updated')
  revalidatePath(`/projects/${projectId}`)
}

/** Counts a quote towards the project's total, or leaves it out (replaced, an alternative, twice). */
export async function setQuoteInTotal(id: string, inTotal: boolean): Promise<Result> {
  const user = await moneyUser()
  if (!user) return { error: 'forbidden' }
  const quote = await quoteOf(id)
  if (!quote || quote.kind !== 'QUOTE') return { error: 'notFound' }
  await db.documentQuote.update({ where: { id }, data: { inTotal, excludedReason: null } })
  await audit({
    userId: user.id,
    action: inTotal ? 'project.quote.include' : 'project.quote.exclude',
    entity: 'Project',
    entityId: quote.document.projectId,
    newValue: quote.document.filename,
  })
  await settle(quote.document.projectId, user.id)
  return {}
}

/** "Read right": the reading is the office's now, and never read again. */
export async function confirmQuote(id: string): Promise<Result> {
  const user = await moneyUser()
  if (!user) return { error: 'forbidden' }
  const quote = await quoteOf(id)
  if (!quote) return { error: 'notFound' }
  await db.documentQuote.update({ where: { id }, data: { confirmedAt: new Date(), confirmedById: user.id } })
  await audit({ userId: user.id, action: 'project.quote.confirm', entity: 'Project', entityId: quote.document.projectId, newValue: quote.document.filename })
  revalidatePath(`/projects/${quote.document.projectId}`)
  return {}
}

/**
 * What the quote really says, typed by the office — also for a scan nobody
 * read. Net and gross as printed; the VAT is what lies between them.
 */
export async function correctQuote(documentId: string, formData: FormData): Promise<Result> {
  const user = await moneyUser()
  if (!user) return { error: 'forbidden' }
  const doc = await db.document.findUnique({ where: { id: documentId }, select: { id: true, projectId: true, filename: true, mimeType: true, quote: true } })
  if (!doc || !isPdfDocument(doc)) return { error: 'notFound' }

  const amount = (name: string) => parseAmount(String(formData.get(name) ?? ''))
  const net = amount('net')
  const gross = amount('gross')
  if (net === 'invalid' || gross === 'invalid' || (net === null && gross === null)) return { error: 'invalid' }
  const dateRaw = String(formData.get('quoteDate') ?? '').trim()
  const quoteDate = dateRaw ? (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : parseGermanDate(dateRaw)) : null
  if (dateRaw && !quoteDate) return { error: 'invalid' }
  const jobRaw = normalizeJobNumber(String(formData.get('jobNumber') ?? ''))
  const quoteNumber = String(formData.get('quoteNumber') ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || null
  // Gross is net and its VAT: never less than net.
  if (net !== null && gross !== null && gross < net) return { error: 'invalid' }
  const totals = net !== null && gross !== null ? consistentTotals({ net, gross, vat: Math.round((gross - net) * 100) / 100, vatRate: null }) : null
  const dec = (n: number | null | undefined) => (n == null ? null : new Prisma.Decimal(n.toFixed(2)))

  const data = {
    kind: 'QUOTE' as const,
    method: doc.quote?.method === 'text' || doc.quote?.method === 'ocr' ? doc.quote.method : 'manual',
    docType: doc.quote?.docType ?? 'Angebot',
    quoteNumber,
    jobNumber: jobRaw,
    quoteDate: quoteDate ? new Date(`${quoteDate}T00:00:00.000Z`) : null,
    net: dec(net),
    gross: dec(gross),
    vat: net !== null && gross !== null ? dec(gross - net) : null,
    vatRate: totals?.vatRate != null ? dec(totals.vatRate) : null,
    confirmedAt: new Date(),
    confirmedById: user.id,
  }
  const wasQuote = doc.quote?.kind === 'QUOTE'
  await db.documentQuote.upsert({
    where: { documentId },
    create: { documentId, ...data, inTotal: true },
    update: { ...data, ...(wasQuote ? {} : { inTotal: true, excludedReason: null }) },
  })
  await db.document.update({ where: { id: documentId }, data: { visibleToCrew: false } })
  await audit({
    userId: user.id,
    action: 'project.quote.correct',
    entity: 'Project',
    entityId: doc.projectId,
    field: doc.filename,
    oldValue: wasQuote ? `${doc.quote?.net ?? '—'} / ${doc.quote?.gross ?? '—'}` : null,
    newValue: `${net ?? '—'} / ${gross ?? '—'}`,
  })
  await settle(doc.projectId, user.id)
  return {}
}

/** "No quote": a letter, a supplier's price list — out of the total, never read again. */
export async function markNotQuote(id: string): Promise<Result> {
  const user = await moneyUser()
  if (!user) return { error: 'forbidden' }
  const quote = await quoteOf(id)
  if (!quote) return { error: 'notFound' }
  await db.documentQuote.update({
    where: { id },
    data: { kind: 'OTHER', inTotal: false, excludedReason: null, confirmedAt: new Date(), confirmedById: user.id },
  })
  await audit({ userId: user.id, action: 'project.quote.notQuote', entity: 'Project', entityId: quote.document.projectId, newValue: quote.document.filename })
  await settle(quote.document.projectId, user.id)
  return {}
}

/** The price the quotes put there is the right one: from now on it is the office's own. */
export async function confirmQuotePrice(projectId: string): Promise<Result> {
  const user = await moneyUser()
  if (!user) return { error: 'forbidden' }
  const project = await db.project.findUnique({ where: { id: projectId }, select: { price: true, priceFromQuote: true } })
  if (!project) return { error: 'notFound' }
  await db.project.update({ where: { id: projectId }, data: { priceFromQuote: null } })
  await audit({ userId: user.id, action: 'project.quote.priceConfirmed', entity: 'Project', entityId: projectId, field: 'price', newValue: project.price === null ? null : String(project.price) })
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/** The Projektnummer the quotes put there is the right one. */
export async function confirmQuoteJobNumber(projectId: string): Promise<Result> {
  const user = await requireManagement()
  const project = await db.project.findUnique({ where: { id: projectId }, select: { jobNumber: true } })
  if (!project) return { error: 'notFound' }
  await db.project.update({ where: { id: projectId }, data: { jobNumberFromQuote: null } })
  await audit({ userId: user.id, action: 'project.quote.jobNumberConfirmed', entity: 'Project', entityId: projectId, field: 'jobNumber', newValue: project.jobNumber })
  revalidatePath(`/projects/${projectId}`)
  return {}
}

/** Reads the project's PDFs that have not been read yet — files from before the reading existed. */
export async function readProjectPdfs(projectId: string): Promise<{ read: number }> {
  const user = await requireManagement()
  const docs = await db.document.findMany({
    where: { projectId, quote: { is: null }, OR: [{ mimeType: 'application/pdf' }, { filename: { endsWith: '.pdf', mode: 'insensitive' } }] },
    select: { id: true },
  })
  let read = 0
  let filled = false
  for (const d of docs) {
    const result = await readDocumentQuote(d.id, { db, readFile: readStoredFile, userId: user.id, ocr: quoteOcr() })
    if (result?.read) read++
    if (result?.applied?.jobNumberFilled) filled = true
  }
  if (filled) pushProjectInBackground(projectId, 'updated')
  revalidatePath(`/projects/${projectId}`)
  return { read }
}
