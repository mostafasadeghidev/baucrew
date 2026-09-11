'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { formatCurrency } from '@/lib/format'
import { btn } from '@/components/ui/button'
import {
  clearPlanLinks,
  exportPlanLinks,
  importPlanLinks,
  linkPlanJob,
  reconcilePlan,
  unlinkPlanJob,
  type LinkImportResult,
  type ReconcileResult,
} from './actions'

export type JobRow = {
  key: string
  /** The sheet lines this job is made of. */
  lineIds: string[]
  /** "Mär" or "Mär–Mai". */
  span: string
  firstMonth: number
  name: string
  amount: number
  isSub: boolean
  months: number
  linked: { id: string; number: string; name: string; orderValue: number | null } | null
  /** Projects this job could belong to; `sure` when the matcher would apply it. */
  suggestions: Array<{ projectId: string; label: string; sure: boolean }>
}

export function PlanTable({
  year,
  rows,
  projects,
  sureCount,
  linkedCount,
}: {
  year: number
  rows: JobRow[]
  projects: ComboboxOption[]
  sureCount: number
  linkedCount: number
}) {
  const t = useTranslations('planMatch')
  const tc = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const money = (v: number | null) => formatCurrency(v, locale)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [result, setResult] = useState<ReconcileResult | null>(null)
  const [imported, setImported] = useState<LinkImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // The links as a file: decided once, carried to the next installation.
  function exportLinks() {
    setError(false)
    startTransition(async () => {
      const text = await exportPlanLinks()
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `planabgleich-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  function importLinks(file: File) {
    setError(false)
    setResult(null)
    setImported(null)
    startTransition(async () => {
      const res = await importPlanLinks(await file.text())
      setImported(res)
      router.refresh()
    })
  }

  function link(row: JobRow, projectId: string) {
    setError(false)
    setBusy(row.key)
    startTransition(async () => {
      const res = await linkPlanJob(row.lineIds, projectId)
      setBusy(null)
      if (res.error) setError(true)
      else router.refresh()
    })
  }

  function unlink(row: JobRow) {
    setError(false)
    setBusy(row.key)
    startTransition(async () => {
      const res = await unlinkPlanJob(row.lineIds)
      setBusy(null)
      if (res.error) setError(true)
      else router.refresh()
    })
  }

  function reconcile() {
    setError(false)
    setResult(null)
    startTransition(async () => {
      const res = await reconcilePlan()
      setResult(res)
      router.refresh()
    })
  }

  function clearAll() {
    setError(false)
    setResult(null)
    startTransition(async () => {
      await clearPlanLinks(year)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {sureCount > 0 && (
          <button type="button" onClick={reconcile} disabled={pending} className={btn.primary}>
            {t('reconcile', { count: sureCount })}
          </button>
        )}
        {linkedCount > 0 && (
          <button type="button" onClick={clearAll} disabled={pending} className={btn.outline}>
            {t('clearAll', { count: linkedCount })}
          </button>
        )}
        {linkedCount > 0 && (
          <button type="button" onClick={exportLinks} disabled={pending} className={btn.outline}>
            {t('exportLinks')}
          </button>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className={btn.outline}
        >
          {t('importLinks')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importLinks(file)
            e.target.value = ''
          }}
        />
        {pending && <span className="text-sm text-muted">{tc('loading')}</span>}
      </div>

      {result && (
        <p className="rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-sm">
          {t('reconcileDone', result)}
        </p>
      )}
      {imported &&
        (imported.invalid ? (
          <p role="alert" className="text-sm text-danger">
            {t('importInvalid')}
          </p>
        ) : (
          <p className="rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-sm">
            {t('importDone', {
              applied: imported.applied,
              alreadyLinked: imported.alreadyLinked,
              missingProject: imported.missingProject,
              missingLine: imported.missingLine,
            })}
          </p>
        ))}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {tc('saveFailed')}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[940px] table-fixed text-sm">
          <colgroup>
            <col className="w-44" />
            <col />
            <col className="w-32" />
            <col className="w-[30%]" />
            <col className="w-32" />
          </colgroup>
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
                <tr key={row.key} className={busy === row.key ? 'opacity-60' : undefined}>
                  <td
                    className="truncate whitespace-nowrap px-3 py-2 text-muted"
                    title={row.months > 1 ? `${row.span} (${t('monthsCount', { count: row.months })})` : row.span}
                  >
                    {row.span}
                    {row.months > 1 && (
                      <span className="ml-1 text-[11px]">({t('monthsCount', { count: row.months })})</span>
                    )}
                  </td>
                  <td className="break-words px-3 py-2">
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
                  <td className="min-w-[280px] break-words px-3 py-2">
                    {row.linked ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <Link href={`/projects/${row.linked.id}`} className="text-accent hover:underline">
                          {row.linked.number} — {row.linked.name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => unlink(row)}
                          disabled={pending}
                          className="text-xs text-muted hover:text-danger hover:underline"
                        >
                          {t('unlink')}
                        </button>
                      </span>
                    ) : (
                      <div className="space-y-1">
                        <Combobox
                          name={`project-${row.key}`}
                          options={projects}
                          defaultValue=""
                          onSelect={(id) => id && link(row, id)}
                          placeholder={t('pickProject')}
                          noResultsLabel={t('noResults')}
                        />
                        {row.suggestions.map((s) => (
                          <button
                            key={s.projectId}
                            type="button"
                            onClick={() => link(row, s.projectId)}
                            disabled={pending}
                            className={`block text-left text-xs hover:underline ${
                              s.sure ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-accent'
                            }`}
                          >
                            {s.sure ? '✓ ' : '? '}
                            {s.label}
                          </button>
                        ))}
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
