'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { formatCurrency } from '@/lib/format'
import { btn } from '@/components/ui/button'
import { planImportWizard, type PlanImportState } from './actions'

export function ImportWizard() {
  const t = useTranslations('importPlan')
  const tc = useTranslations('common')
  const locale = useLocale()
  const money = (v: number) => formatCurrency(v, locale)

  // One action drives all three phases; the parsed rows travel in the state
  // between preview and import, so the file is read exactly once.
  const [state, formAction, pending] = useActionState<PlanImportState, FormData>(
    planImportWizard,
    { step: 'upload' }
  )

  if (state.step === 'done') {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-5">
          <p className="text-lg font-semibold">✓ {t('doneTitle')}</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>{t('doneYears', { years: state.years.join(', ') })}</li>
            <li>{t('doneImported', { count: state.imported })}</li>
            {state.replaced > 0 && <li>{t('doneReplaced', { count: state.replaced })}</li>}
            {state.relinked > 0 && <li>{t('doneRelinked', { count: state.relinked })}</li>}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/reports?tab=revenue" className={btn.primary}>
            {t('goToReports')}
          </Link>
          <Link href="/settings/import-plan" className={btn.outline}>
            {t('importAnother')}
          </Link>
        </div>
      </div>
    )
  }

  if (state.step === 'preview') {
    return (
      <form action={formAction} className="max-w-3xl space-y-4">
        <input type="hidden" name="_phase" value="import" />
        <p className="text-sm text-muted">{t('previewHint')}</p>

        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">{t('colYear')}</th>
                <th className="px-3 py-2 font-medium">{t('colMonths')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('colOwn')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('colSub')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('colTotal')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {state.years.map((y) => (
                <tr key={y.year}>
                  <td className="px-3 py-2">
                    <label className="flex cursor-pointer items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        name="year"
                        value={y.year}
                        defaultChecked
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      {y.year}
                    </label>
                    {y.existing > 0 && (
                      <p className="mt-0.5 pl-6 text-xs text-amber-700 dark:text-amber-400">
                        {t('willReplace', { count: y.existing })}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {t('monthsFilled', { count: y.filledMonths, entries: y.entries })}
                    {y.open > 0 && (
                      <p className="text-xs">{t('withoutMonth', { amount: money(y.open) })}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{money(y.own)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{money(y.sub)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {money(y.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted">{t('replaceHint')}</p>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={btn.primary}>
            {pending ? tc('loading') : t('startImport')}
          </button>
          <Link href="/settings/import-plan" className={btn.outline}>
            {tc('cancel')}
          </Link>
        </div>
      </form>
    )
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      <input type="hidden" name="_phase" value="preview" />
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-medium">{t('howTo')}</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted">
          <li>{t('step1')}</li>
          <li>{t('step2')}</li>
          <li>{t('step3')}</li>
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? tc('loading') : t('analyze')}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {t(state.error)}
        </p>
      )}
    </form>
  )
}
