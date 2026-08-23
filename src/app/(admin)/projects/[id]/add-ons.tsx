'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import { addProjectAddOn, removeProjectAddOn } from '../actions'
import { btn } from '@/components/ui/button'

/** Amounts and dates arrive pre-formatted — a client component cannot receive functions. */
export type AddOnRow = { id: string; label: string; amount: number; amountLabel: string; dateLabel: string }

const inputClass =
  'block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

/**
 * Follow-on offers accepted after the main order. They are added to the order
 * value of the project and to every report, so the totals match the office.
 */
export function ProjectAddOns({
  projectId,
  addOns,
  totalLabel,
}: {
  projectId: string
  addOns: AddOnRow[]
  /** Sum of all follow-on offers, already formatted. */
  totalLabel: string
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const total = addOns.reduce((sum, a) => sum + a.amount, 0)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    setError(null)
    startTransition(async () => {
      const res = await addProjectAddOn(projectId, data)
      if (res.error) {
        setError(
          res.error === 'labelRequired'
            ? t('addOnLabelRequired')
            : res.error === 'invalidAmount'
              ? t('invalidPrice')
              : tc('saveFailed')
        )
        return
      }
      form.reset()
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t('addOnsTitle')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('addOnsHint')}</p>
        </div>
        {total > 0 && <p className="text-sm font-semibold tabular-nums">+ {totalLabel}</p>}
      </div>

      {addOns.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">{t('addOnsNone')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {addOns.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{a.label}</span>
                <span className="ml-2 text-xs text-muted tabular-nums">{a.dateLabel}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-medium tabular-nums">{a.amountLabel}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await removeProjectAddOn(projectId, a.id)
                      router.refresh()
                    })
                  }
                  title={tc('delete')}
                  aria-label={tc('delete')}
                  className="rounded-md border border-border p-1 text-muted hover:bg-danger/10 hover:text-danger"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border px-5 py-3">
        {open ? (
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            <div className="min-w-52 flex-1">
              <label htmlFor="addon-label" className="block text-xs font-medium text-muted">
                {t('addOnLabel')}
              </label>
              <input id="addon-label" name="label" required className={`${inputClass} mt-1`} />
            </div>
            <div>
              <label htmlFor="addon-amount" className="block text-xs font-medium text-muted">
                {t('price')} (€)
              </label>
              <input
                id="addon-amount"
                name="amount"
                inputMode="decimal"
                required
                className={`${inputClass} mt-1 w-32`}
              />
            </div>
            <div>
              <label htmlFor="addon-date" className="block text-xs font-medium text-muted">
                {t('addOnDate')}
              </label>
              <input
                id="addon-date"
                name="date"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={`${inputClass} mt-1`}
              />
            </div>
            <button type="submit" disabled={pending} className={btn.primarySm}>
              {tc('save')}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={btn.outlineSm}>
              {tc('cancel')}
            </button>
            {error && (
              <p role="alert" className="w-full text-sm text-danger">
                {error}
              </p>
            )}
          </form>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className={btn.outlineSm}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('addOnAdd')}
          </button>
        )}
      </div>
    </section>
  )
}
