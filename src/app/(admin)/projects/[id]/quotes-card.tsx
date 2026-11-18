import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import type { CurrentUser } from '@/lib/auth'
import { canViewFinancials, isOffice } from '@/lib/authz'
import { formatCurrency, formatDate } from '@/lib/format'
import { QUOTE_LEFT_OUT, jobNumberDiffers, quoteTotals, type QuoteLeftOut } from '@/lib/quotes'
import { QuotesPanel, type QuoteRowView } from './quotes-panel'

/**
 * The project's quotes as read from its PDFs (src/lib/quotes-db.ts): each
 * one's numbers and sums, the total across those that count, and the price
 * and Projektnummer they filled in, marked "aus Angebot erkannt" until the
 * office confirms them. The office's alone; the amounts only for those who
 * may see money — left out of the query, not hidden on the screen.
 */
export async function ProjectQuotes({
  user,
  project,
  locale,
  hidePrices,
}: {
  user: CurrentUser
  project: { id: string; jobNumber: string | null; jobNumberFromQuote: string | null; price: unknown; priceFromQuote: unknown }
  locale: string
  hidePrices: boolean
}) {
  if (!isOffice(user)) return null
  const money = canViewFinancials(user)
  const t = await getTranslations('quotes')

  const [rows, unread] = await Promise.all([
    db.documentQuote.findMany({
      where: { kind: { in: ['QUOTE', 'SCAN', 'FAILED'] }, document: { projectId: project.id } },
      orderBy: [{ quoteDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        documentId: true,
        kind: true,
        method: true,
        docType: true,
        quoteNumber: true,
        jobNumber: true,
        quoteDate: true,
        inTotal: true,
        excludedReason: true,
        confirmedAt: true,
        document: { select: { filename: true } },
        ...(money ? { net: true, gross: true } : {}),
      },
    }),
    db.document.count({
      where: { projectId: project.id, quote: { is: null }, OR: [{ mimeType: 'application/pdf' }, { filename: { endsWith: '.pdf', mode: 'insensitive' } }] },
    }),
  ])
  if (rows.length === 0 && unread === 0) return null

  const amount = (d: unknown) => (d == null ? null : Number(d))
  const plain = (n: number | null) => (n === null ? '' : n.toFixed(2).replace('.', locale === 'en' ? '.' : ','))
  const views: QuoteRowView[] = rows.map((r) => {
    const net = money ? amount((r as { net?: unknown }).net) : null
    const gross = money ? amount((r as { gross?: unknown }).gross) : null
    return {
      id: r.id,
      documentId: r.documentId,
      filename: r.document.filename,
      kind: r.kind as QuoteRowView['kind'],
      title: [r.docType ?? t('quote'), r.quoteNumber].filter(Boolean).join(' '),
      dateLabel: r.quoteDate ? formatDate(r.quoteDate, locale) : null,
      quoteDate: r.quoteDate ? r.quoteDate.toISOString().slice(0, 10) : '',
      quoteNumber: r.quoteNumber ?? '',
      jobNumber: r.jobNumber,
      jobNumberDiffers: jobNumberDiffers(project.jobNumber, r.jobNumber),
      netLabel: money && net !== null ? formatCurrency(net, locale, { hidden: hidePrices }) : null,
      grossLabel: money && gross !== null ? formatCurrency(gross, locale, { hidden: hidePrices }) : null,
      net: money ? plain(net) : '',
      gross: money ? plain(gross) : '',
      inTotal: r.inTotal,
      reason: QUOTE_LEFT_OUT.includes(r.excludedReason as QuoteLeftOut) ? (r.excludedReason as QuoteLeftOut) : null,
      confirmed: r.confirmedAt !== null,
      method: r.method,
    }
  })

  const quotes = rows.filter((r) => r.kind === 'QUOTE')
  const totals = money
    ? quoteTotals(
        quotes.map((r) => ({
          id: r.id,
          isQuote: true,
          inTotal: r.inTotal,
          quoteNumber: r.quoteNumber,
          jobNumber: r.jobNumber,
          net: amount((r as { net?: unknown }).net),
          gross: amount((r as { gross?: unknown }).gross),
        }))
      )
    : null
  const price = amount(project.price)
  const priceFromQuote = amount(project.priceFromQuote)
  const priceRecognized = money && price !== null && priceFromQuote !== null && Math.abs(price - priceFromQuote) < 0.005

  return (
    <QuotesPanel
      projectId={project.id}
      money={money}
      rows={views}
      unread={unread}
      total={
        totals && totals.count > 0
          ? {
              count: totals.count,
              net: formatCurrency(totals.net, locale, { hidden: hidePrices }),
              gross: formatCurrency(totals.gross, locale, { hidden: hidePrices }),
            }
          : null
      }
      priceRecognized={priceRecognized ? formatCurrency(price, locale, { hidden: hidePrices }) : null}
      jobNumberRecognized={project.jobNumber && project.jobNumberFromQuote === project.jobNumber ? project.jobNumber : null}
      projectJobNumber={project.jobNumber}
    />
  )
}
