'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { formatCurrency } from '@/lib/format'
import { btn } from '@/components/ui/button'
import { applyPlanSuggestions, clearPlanLinks, linkPlanEntry } from './actions'

export type PlanRow = {
  id: string
  monthLabel: string
  name: string
  amount: number
  isSub: boolean
  /** The project it is tied to, if any. */
  linked: { id: string; number: string; name: string; orderValue: number | null } | null
  /** What the matcher would pick, while the line is still free. */
  suggestion: { projectId: string; label: string; score: number } | null
}

export function PlanTable({
  year,
  rows,
  projects,
  suggestionCount,
  linkedCount,
}: {
  year: number
  rows: PlanRow[]
  projects: ComboboxOption[]
  suggestionCount: number
  linkedCount: number
}) {
  const t = useTranslations('planMatch')
  const tc = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const money = (v: number | null) => formatCurrency(v, locale)
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function link(entryId: string, projectId: string) {
    setError(null)
    setBusyId(entryId)
    startTransition(async () => {
      const res = await linkPlanEntry(entryId, projectId)
      setBusyId(null)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function applyAll() {
    setError(null)
    startTransition(async () => {
      await applyPlanSuggestions(year)
      router.refresh()
    })
  }

  function clearAll() {
    setError(null)
    startTransition(async () => {
      await clearPlanLinks(year)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {suggestionCount > 0 && (
          <button type="button" onClick={applyAll} disabled={pending} className={btn.primary}>
            {t('applyAll', { count: suggestionCount })}
          </button>
        )}
        {linkedCount > 0 && (
          <button type="button" onClick={clearAll} disabled={pending} className={btn.outline}>
            {t('clearAll', { count: linkedCount })}
          </button>
        )}
        {pending && <span className="text-sm text-muted">{tc('loading')}</span>}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {tc('saveFailed')}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">{t('colMonth')}</th>
              <th className="px-3 py-2 font-medium">{t('colSite')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('colPlan')}</th>
              <th className="px-3 py-2 font-medium">{t('colProject')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('colActual')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  {t('none')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={busyId === row.id ? 'opacity-60' : undefined}>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{row.monthLabel}</td>
                  <td className="px-3 py-2">
                    {row.name}
                    {row.isSub && (
                      <span className="ml-2 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">
                        SUB
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted">
                    {money(row.amount)}
                  </td>
                  <td className="min-w-[260px] px-3 py-2">
                    {row.linked ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/projects/${row.linked.id}`}
                          className="text-accent hover:underline"
                        >
                          {row.linked.number} — {row.linked.name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => link(row.id, '')}
                          disabled={pending}
                          className="text-xs text-muted hover:text-danger hover:underline"
                        >
                          {t('unlink')}
                        </button>
                      </span>
                    ) : (
                      <div className="space-y-1">
                        <Combobox
                          name={`project-${row.id}`}
                          options={projects}
                          defaultValue=""
                          onSelect={(id) => id && link(row.id, id)}
                          placeholder={t('pickProject')}
                          noResultsLabel={t('noResults')}
                        />
                        {row.suggestion && (
                          <button
                            type="button"
                            onClick={() => link(row.id, row.suggestion!.projectId)}
                            disabled={pending}
                            className="text-xs text-accent hover:underline"
                          >
                            {t('takeSuggestion', { project: row.suggestion.label })}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {row.linked ? (
                      <span
                        className={
                          row.linked.orderValue == null
                            ? 'text-muted'
                            : row.linked.orderValue >= row.amount
                              ? 'font-medium text-emerald-700 dark:text-emerald-400'
                              : 'font-medium text-amber-700 dark:text-amber-400'
                        }
                      >
                        {money(row.linked.orderValue)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
