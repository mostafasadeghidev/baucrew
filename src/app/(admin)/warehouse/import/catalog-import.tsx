'use client'

/**
 * A list of materials and tools brought into the catalogue: pasted (straight
 * out of Excel, or a CSV), a file, or the starter list — then the preview of
 * what each line does (new, filled, already there), then the result. Nothing
 * is written before "Übernehmen"; the server makes the plan again then.
 */

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { FileSpreadsheet, ListPlus } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { CATALOG_STARTER_CSV } from '@/lib/catalog-starter'
import type { CatalogPlanEntry } from '@/lib/project-needs'
import { importCatalogList, previewCatalogList, type CatalogImportResult, type CatalogPreview } from './actions'

const ACTION_STYLE: Record<CatalogPlanEntry['action'], string> = {
  create: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  fill: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  same: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300',
  repeat: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

export function CatalogImport({ kinds }: { kinds: Array<{ value: string; label: string }> }) {
  const t = useTranslations('catalogImport')
  const tWarehouse = useTranslations('warehouse')
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [defaultKind, setDefaultKind] = useState(kinds.find((k) => k.value === 'MATERIAL')?.value ?? kinds[0]?.value ?? 'MATERIAL')
  const [preview, setPreview] = useState<CatalogPreview | null>(null)
  const [result, setResult] = useState<CatalogImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const kindLabel = (value: string) => kinds.find((k) => k.value === value)?.label ?? value

  const input = (source: { text?: string; file?: File | null } = {}) => {
    const body = new FormData()
    const chosen = source.file !== undefined ? source.file : file
    if (chosen) body.append('file', chosen)
    else body.append('text', source.text ?? text)
    body.append('defaultKind', defaultKind)
    return body
  }

  function showPreview(source?: { text?: string; file?: File | null }) {
    setError(null)
    setResult(null)
    startTransition(async () => {
      const res = await previewCatalogList(input(source))
      if (res.error) {
        setPreview(null)
        setError(t(res.error))
      } else setPreview(res.preview ?? null)
    })
  }

  function run() {
    setError(null)
    startTransition(async () => {
      const res = await importCatalogList(input())
      if (res.error) setError(t(res.error))
      else {
        setResult(res.result ?? null)
        setPreview(null)
      }
    })
  }

  const toWrite = preview ? preview.summary.create + preview.summary.fill : 0

  return (
    <div className="space-y-4">
      {/* Step 1: the list */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">{t('step1')}</h2>
        <p className="mt-0.5 text-xs text-muted">{t('step1Hint')}</p>
        {file ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-subtle px-3 py-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-muted" aria-hidden />
            <span className="font-medium">{file.name}</span>
            <button
              type="button"
              className={`${btn.ghost} ml-auto`}
              onClick={() => {
                setFile(null)
                setPreview(null)
              }}
            >
              {t('removeFile')}
            </button>
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setPreview(null)
            }}
            rows={10}
            spellCheck={false}
            placeholder={t('placeholder')}
            aria-label={t('step1')}
            className="mt-3 block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0]
              e.target.value = ''
              if (!picked) return
              setFile(picked)
              showPreview({ file: picked })
            }}
          />
          <button type="button" className={btn.outline} disabled={pending} onClick={() => fileRef.current?.click()}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            {t('chooseFile')}
          </button>
          <button
            type="button"
            className={btn.outline}
            disabled={pending}
            onClick={() => {
              setFile(null)
              setText(CATALOG_STARTER_CSV)
              showPreview({ text: CATALOG_STARTER_CSV, file: null })
            }}
          >
            <ListPlus className="h-4 w-4" aria-hidden />
            {t('useStarter')}
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted">{t('defaultKind')}</span>
            <Select compact value={defaultKind} onChange={(e) => setDefaultKind(e.target.value)} className="w-auto min-w-32">
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </label>
          <button type="button" className={btn.primary} disabled={pending || (!file && !text.trim())} onClick={() => showPreview()}>
            {t('preview')}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </section>

      {/* Step 2: what each line does */}
      {preview && (
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">{t('step2')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t(preview.hasHeader ? 'headerFound' : 'noHeader')}</p>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
            {(['create', 'fill', 'same', 'repeat'] as const).map((action) => (
              <li key={action} className={`rounded-full px-2.5 py-1 ${ACTION_STYLE[action]}`}>
                {t(`count_${action}`, { count: preview.summary[action] })}
              </li>
            ))}
            {preview.issues.length > 0 && (
              <li className="rounded-full bg-red-500/15 px-2.5 py-1 text-red-700 dark:text-red-400">
                {t('count_issues', { count: preview.issues.length })}
              </li>
            )}
          </ul>

          {preview.issues.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs">
              {preview.issues.map((issue) => (
                <li key={issue.line}>
                  <span className="tabular-nums text-muted">{t('line', { line: issue.line })}</span> {t(`issue_${issue.problem}`)}
                  {issue.text && <span className="text-muted"> — {issue.text}</span>}
                </li>
              ))}
            </ul>
          )}

          {preview.plan.length > 0 && (
            <div className="mt-4 max-h-[28rem] overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-subtle">
                  <tr className="border-b border-border text-left">
                    <th className="w-12 px-2 py-1.5 font-medium">{t('lineShort')}</th>
                    <th className="px-2 py-1.5 font-medium">{t('status')}</th>
                    <th className="px-2 py-1.5 font-medium">{tWarehouse('kind')}</th>
                    <th className="px-2 py-1.5 font-medium">{tWarehouse('name')}</th>
                    <th className="px-2 py-1.5 font-medium">{tWarehouse('category')}</th>
                    <th className="px-2 py-1.5 font-medium">{tWarehouse('unit')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.plan.map((entry) => (
                    <tr key={entry.line}>
                      <td className="px-2 py-1 tabular-nums text-muted">{entry.line}</td>
                      <td className="px-2 py-1">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${ACTION_STYLE[entry.action]}`}>{t(`action_${entry.action}`)}</span>
                        {entry.action === 'fill' && (
                          <span className="ml-1 text-muted">
                            {Object.keys(entry.fills)
                              .map((field) => tWarehouse(field as 'category' | 'unit' | 'location' | 'notes'))
                              .join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1">{kindLabel(entry.kind)}</td>
                      <td className="px-2 py-1 font-medium">{entry.name}</td>
                      <td className="px-2 py-1 text-muted">{entry.category ?? '—'}</td>
                      <td className="px-2 py-1 text-muted">{entry.unit ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-xs text-muted">{t('neverOverwrites')}</p>
            <button type="button" className={`${btn.primary} ml-auto`} disabled={pending || toWrite === 0} onClick={run}>
              {t('run', { count: toWrite })}
            </button>
          </div>
        </section>
      )}

      {/* Step 3: what happened */}
      {result && (
        <section className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm">
          <p className="font-medium">{t('result', result)}</p>
          <Link href="/warehouse" className={`${btn.primarySm} mt-3`}>
            {t('toWarehouse')}
          </Link>
        </section>
      )}
    </div>
  )
}
