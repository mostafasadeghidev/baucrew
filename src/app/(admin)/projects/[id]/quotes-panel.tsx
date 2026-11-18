'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Check, FileText, Sparkles } from 'lucide-react'
import { btn } from '@/components/ui/button'
import type { QuoteLeftOut } from '@/lib/quotes'
import {
  confirmQuote,
  confirmQuoteJobNumber,
  confirmQuotePrice,
  correctQuote,
  markNotQuote,
  readProjectPdfs,
  setQuoteInTotal,
} from './quote-actions'

/** One read PDF, ready to show: amounts arrive formatted, and only for those who may see money. */
export type QuoteRowView = {
  id: string
  documentId: string
  filename: string
  kind: 'QUOTE' | 'SCAN' | 'FAILED'
  title: string
  dateLabel: string | null
  /** For the correction form: "YYYY-MM-DD". */
  quoteDate: string
  quoteNumber: string
  jobNumber: string | null
  jobNumberDiffers: boolean
  netLabel: string | null
  grossLabel: string | null
  /** For the correction form, as typed: "12.345,00" → "12345,00". Empty without money. */
  net: string
  gross: string
  inTotal: boolean
  reason: QuoteLeftOut | null
  confirmed: boolean
  method: string
}

const inputClass =
  'block w-full rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

/**
 * The quotes found in a project's PDFs: what each says, whether it counts,
 * the total, and what the office still has to confirm. See quotes-card.tsx.
 */
export function QuotesPanel({
  projectId,
  money,
  rows,
  unread,
  total,
  priceRecognized,
  jobNumberRecognized,
  projectJobNumber,
}: {
  projectId: string
  money: boolean
  rows: QuoteRowView[]
  unread: number
  total: { count: number; net: string; gross: string } | null
  priceRecognized: string | null
  jobNumberRecognized: string | null
  projectJobNumber: string | null
}) {
  const t = useTranslations('quotes')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (action: () => Promise<{ error?: string } | unknown>) =>
    startTransition(async () => {
      setError(null)
      const result = (await action()) as { error?: string } | undefined
      if (result && typeof result === 'object' && 'error' in result && result.error) setError(t(`error_${result.error}` as 'error_invalid'))
      else router.refresh()
    })

  const quotes = rows.filter((r) => r.kind === 'QUOTE')
  const unreadable = rows.filter((r) => r.kind !== 'QUOTE')

  function correctionForm(row: { documentId: string; quoteNumber: string; jobNumber: string | null; quoteDate: string; net: string; gross: string }) {
    return (
      <form
        className="mt-2 grid gap-2 rounded-lg border border-border bg-surface-hover/40 p-3 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          run(async () => {
            const result = await correctQuote(row.documentId, data)
            if (!result.error) setEditing(null)
            return result
          })
        }}
      >
        <label className="text-xs text-muted">
          {t('quoteNumber')}
          <input name="quoteNumber" defaultValue={row.quoteNumber} className={inputClass} />
        </label>
        <label className="text-xs text-muted">
          {t('jobNumber')}
          <input name="jobNumber" defaultValue={row.jobNumber ?? ''} className={inputClass} />
        </label>
        <label className="text-xs text-muted">
          {t('date')}
          <input type="date" name="quoteDate" defaultValue={row.quoteDate} className={inputClass} />
        </label>
        <label className="text-xs text-muted">
          {t('net')}
          <input name="net" inputMode="decimal" defaultValue={row.net} className={`${inputClass} tabular-nums`} />
        </label>
        <label className="text-xs text-muted">
          {t('gross')}
          <input name="gross" inputMode="decimal" defaultValue={row.gross} className={`${inputClass} tabular-nums`} />
        </label>
        <div className="flex gap-2 sm:col-span-5">
          <button type="submit" disabled={pending} className={btn.primarySm}>
            {tc('save')}
          </button>
          <button type="button" onClick={() => setEditing(null)} className={btn.ghost}>
            {tc('cancel')}
          </button>
        </div>
      </form>
    )
  }

  return (
    <section id="quotes" className="scroll-mt-24 rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <p className="mt-0.5 text-xs text-muted">{t('hint')}</p>
      </div>

      <div className="space-y-3 px-5 py-4 text-sm">
        {(priceRecognized || jobNumberRecognized) && (
          <ul className="space-y-2">
            {priceRecognized && (
              <li className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/5 px-3 py-2">
                <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">{t('priceRecognized', { price: priceRecognized })}</span>
                <button type="button" disabled={pending} onClick={() => run(() => confirmQuotePrice(projectId))} className={btn.outlineXs}>
                  {t('confirm')}
                </button>
              </li>
            )}
            {jobNumberRecognized && (
              <li className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/5 px-3 py-2">
                <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">{t('jobNumberRecognized', { number: jobNumberRecognized })}</span>
                <button type="button" disabled={pending} onClick={() => run(() => confirmQuoteJobNumber(projectId))} className={btn.outlineXs}>
                  {t('confirm')}
                </button>
              </li>
            )}
          </ul>
        )}

        {quotes.length > 0 && (
          <ul className="divide-y divide-border">
            {quotes.map((q) => (
              <li key={q.id} className="py-2.5 first:pt-0">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/files/${q.documentId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
                      title={q.filename}
                    >
                      <FileText aria-hidden className="h-4 w-4 shrink-0" />
                      {q.title}
                    </a>
                    <p className="mt-0.5 text-xs text-muted">
                      {[q.dateLabel, q.jobNumber ? t('jobNumberShort', { number: q.jobNumber }) : t('noJobNumber')].filter(Boolean).join(' · ')}
                      {' · '}
                      {q.confirmed ? (
                        <span className="text-emerald-700 dark:text-emerald-400">{t('confirmed')}</span>
                      ) : (
                        <span>{q.method === 'ocr' ? t('recognizedOcr') : t('recognized')}</span>
                      )}
                    </p>
                    {q.jobNumberDiffers && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        {t('jobNumberDiffers', { quote: q.jobNumber ?? '', project: projectJobNumber ?? '' })}
                      </p>
                    )}
                    {!q.inTotal && q.reason && <p className="mt-1 text-xs text-muted">{t(`reason_${q.reason}`)}</p>}
                  </div>
                  {money && (
                    <div className="text-right tabular-nums">
                      <div className={q.inTotal ? 'font-medium' : 'text-muted line-through'}>{q.netLabel ?? '—'}</div>
                      <div className="text-xs text-muted">
                        {t('grossShort')} {q.grossLabel ?? '—'}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {money && (
                    <label className="inline-flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={q.inTotal}
                        disabled={pending}
                        onChange={(e) => {
                          const next = e.currentTarget.checked
                          run(() => setQuoteInTotal(q.id, next))
                        }}
                        className="h-4 w-4 rounded border-border-strong accent-[var(--color-accent)]"
                      />
                      {t('inTotal')}
                    </label>
                  )}
                  {money && !q.confirmed && (
                    <button type="button" disabled={pending} onClick={() => run(() => confirmQuote(q.id))} className={btn.outlineXs}>
                      <Check aria-hidden className="h-3.5 w-3.5" />
                      {t('confirm')}
                    </button>
                  )}
                  {money && (
                    <button type="button" onClick={() => setEditing(editing === q.id ? null : q.id)} className={btn.outlineXs}>
                      {t('correct')}
                    </button>
                  )}
                  {money && (
                    <button type="button" disabled={pending} onClick={() => run(() => markNotQuote(q.id))} className={btn.ghost}>
                      {t('notQuote')}
                    </button>
                  )}
                </div>
                {editing === q.id && correctionForm(q)}
              </li>
            ))}
          </ul>
        )}

        {money && total && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3">
            <span className="font-medium">{t('total', { count: total.count })}</span>
            <span className="tabular-nums">
              <span className="font-semibold">{total.net}</span>
              <span className="ml-2 text-xs text-muted">
                {t('grossShort')} {total.gross}
              </span>
            </span>
          </div>
        )}

        {unreadable.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-muted">{t('unreadableTitle')}</p>
            <ul className="mt-1 space-y-1.5">
              {unreadable.map((r) => (
                <li key={r.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/api/files/${r.documentId}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-accent hover:underline">
                      {r.filename}
                    </a>
                    <span className="text-xs text-muted">{r.kind === 'SCAN' ? t('scan') : t('failed')}</span>
                    {money && (
                      <button type="button" onClick={() => setEditing(editing === r.id ? null : r.id)} className={btn.outlineXs}>
                        {t('enterValues')}
                      </button>
                    )}
                  </div>
                  {editing === r.id && correctionForm({ ...r, quoteNumber: '', jobNumber: null, quoteDate: '', net: '', gross: '' })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {unread > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted">
            <span className="flex-1">{t('unread', { count: unread })}</span>
            <button type="button" disabled={pending} onClick={() => run(() => readProjectPdfs(projectId))} className={btn.outlineXs}>
              {t('readNow')}
            </button>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </section>
  )
}
