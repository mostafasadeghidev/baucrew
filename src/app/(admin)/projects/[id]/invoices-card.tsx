'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Undo2 } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'
import { markProjectInvoiceReady, withdrawProjectInvoice, type InvoiceActionResult } from './invoice-actions'

/** One of the two invoices, with every figure already formatted on the server. */
export type InvoiceRow = {
  part: 1 | 2
  ready: { dateLabel: string; byLabel: string | null; amountLabel: string | null; number: string | null } | null
  /** What it will likely ask for, formatted — null while the job has no value. */
  suggestedLabel: string | null
  /** The same amount as the office types it, to start the field with. */
  suggestedInput: string
}

const inputClass =
  'block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

/**
 * The job's two invoices — half on account, the rest at the end. The invoice
 * is written in the accounting program; here the office says it is ready, and
 * the automation prepares the e-mail.
 */
export function ProjectInvoices({
  projectId,
  rows,
  amountField,
}: {
  projectId: string
  rows: InvoiceRow[]
  /** False while prices are hidden on screen: the suggested amount is taken without showing it. */
  amountField: boolean
}) {
  const t = useTranslations('projects')

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{t('invoicesTitle')}</h2>
        <p className="mt-0.5 text-xs text-muted">{t('invoicesHint')}</p>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <InvoiceItem key={row.part} projectId={projectId} row={row} amountField={amountField} />
        ))}
      </ul>
    </section>
  )
}

function InvoiceItem({ projectId, row, amountField }: { projectId: string; row: InvoiceRow; amountField: boolean }) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const title = row.part === 1 ? t('invoiceFirst') : t('invoiceFinal')

  const done = (res: InvoiceActionResult) => {
    if (res.error) {
      setError(res.error === 'invalidAmount' ? t('invalidPrice') : res.error === 'notAllowed' ? t('invoiceNotAllowed') : tc('saveFailed'))
      return false
    }
    setError(null)
    router.refresh()
    return true
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      if (done(await markProjectInvoiceReady(projectId, row.part, data))) setOpen(false)
    })
  }

  return (
    <li className="px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          {row.ready ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {t('invoiceReady')}
              </span>
              <span className="tabular-nums">{row.ready.dateLabel}</span>
              {row.ready.byLabel && <span>· {row.ready.byLabel}</span>}
              {row.ready.number && <span>· {t('invoiceNumberShort', { number: row.ready.number })}</span>}
            </p>
          ) : (
            row.suggestedLabel && (
              <p className="mt-0.5 text-xs text-muted tabular-nums">{t('invoiceSuggested', { amount: row.suggestedLabel })}</p>
            )
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {row.ready?.amountLabel && <span className="font-medium tabular-nums">{row.ready.amountLabel}</span>}
          {row.ready ? (
            <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={btn.outlineSm}>
              <Undo2 className="h-4 w-4" aria-hidden />
              {t('invoiceWithdraw')}
            </button>
          ) : (
            !open && (
              <button type="button" onClick={() => setOpen(true)} className={btn.outlineSm}>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {t('invoiceMarkReady')}
              </button>
            )
          )}
        </div>
      </div>

      {open && !row.ready && (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <label htmlFor={`invoice-${row.part}-number`} className="block text-xs font-medium text-muted">
              {t('invoiceNumber')}
            </label>
            <input id={`invoice-${row.part}-number`} name="number" maxLength={60} className={`${inputClass} mt-1`} />
          </div>
          {amountField && (
            <div>
              <label htmlFor={`invoice-${row.part}-amount`} className="block text-xs font-medium text-muted">
                {t('invoiceAmount')}
              </label>
              <input
                id={`invoice-${row.part}-amount`}
                name="amount"
                inputMode="decimal"
                defaultValue={row.suggestedInput}
                className={`${inputClass} mt-1 w-36 tabular-nums`}
              />
            </div>
          )}
          <button type="submit" disabled={pending} className={btn.primarySm}>
            {t('invoiceSubmit')}
          </button>
          <button type="button" onClick={() => setOpen(false)} className={btn.outlineSm}>
            {tc('cancel')}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      <AlertDialog
        open={confirming}
        title={t('invoiceWithdraw')}
        description={t('invoiceWithdrawConfirm', { invoice: title })}
        confirmLabel={t('invoiceWithdraw')}
        cancelLabel={tc('cancel')}
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          startTransition(async () => {
            done(await withdrawProjectInvoice(projectId, row.part))
          })
        }}
      />
    </li>
  )
}
