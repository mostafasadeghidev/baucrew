'use client'

/**
 * Customers, employees or vehicles from a spreadsheet: what is imported, the
 * file, which column is which — guessed from the headers, to be corrected —
 * and the result. The file never leaves the browser between the preview and
 * the import.
 */

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FileSpreadsheet } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { MASTER_FIELDS, MASTER_KINDS, guessMapping, mappingComplete, type MasterKind, type MasterMapping } from '@/lib/import-master'

type Preview = { headers: string[]; rows: Array<Array<string | number>>; totalRows: number }
type RunResult = { created: number; updated: number; unchanged: number; skipped: number }

const LIST_OF: Record<MasterKind, string> = { customers: '/customers', employees: '/employees', vehicles: '/vehicles' }

export function MasterImportWizard({ initialKind }: { initialKind: MasterKind }) {
  const t = useTranslations('importMaster')
  const tc = useTranslations('common')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<MasterKind>(initialKind)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<MasterMapping>({})
  const [overwrite, setOverwrite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const choose = (next: MasterKind) => {
    setKind(next)
    setResult(null)
    // The same file read as something else: the headers are guessed again.
    setMapping(preview ? guessMapping(next, preview.headers) : {})
  }

  async function loadFile(picked: File) {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', picked)
      const res = await fetch('/api/import/preview', { method: 'POST', body })
      if (!res.ok) return setError(t('parseFailed'))
      const data = (await res.json()) as Preview
      setFile(picked)
      setPreview(data)
      setMapping(guessMapping(kind, data.headers))
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    if (!file || !mappingComplete(kind, mapping)) return
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('kind', kind)
      body.append('file', file)
      body.append('mapping', JSON.stringify(mapping))
      if (overwrite) body.append('overwrite', '1')
      const res = await fetch('/api/import/master', { method: 'POST', body })
      if (!res.ok) return setError(t('runFailed'))
      setResult((await res.json()) as RunResult)
      startTransition(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  const ready = mappingComplete(kind, mapping)

  return (
    <div className="space-y-4">
      {/* Step 1: what, and the file */}
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{t('step1')}</h2>
        <div role="radiogroup" aria-label={t('step1')} className="mt-3 inline-flex gap-1 rounded-lg bg-subtle p-1 text-sm font-medium">
          {MASTER_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => choose(option)}
              className={`rounded-md px-3 py-1.5 transition-colors ${kind === option ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}
            >
              {t(`kind_${option}`)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t(`match_${kind}`)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0]
              if (picked) void loadFile(picked)
              e.target.value = ''
            }}
          />
          <button type="button" className={btn.outline} disabled={busy} onClick={() => inputRef.current?.click()}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            {t('chooseFile')}
          </button>
          {file && preview && (
            <span className="text-sm text-muted">
              {file.name} · {t('rowCount', { count: preview.totalRows })}
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </section>

      {/* Step 2: which column is which */}
      {preview && (
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold">{t('step2')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('step2Hint')}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MASTER_FIELDS[kind].map((field) => (
              <label key={field} className="block text-sm">
                {t(`field_${field}`)}
                {(field === 'name' || (kind === 'employees' && (field === 'fullName' || field === 'lastName'))) && <span className="text-danger"> *</span>}
                <Select
                  className="mt-1 w-full"
                  value={mapping[field] ?? ''}
                  onChange={(e) =>
                    setMapping((prev) => {
                      const next = { ...prev }
                      if (e.target.value) next[field] = e.target.value
                      else delete next[field]
                      return next
                    })
                  }
                >
                  <option value="">{tc('none')}</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-subtle text-left">
                  {preview.headers.map((h) => (
                    <th key={h} className="px-2 py-1.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows.map((row, i) => (
                  <tr key={i}>
                    {preview.headers.map((_, col) => (
                      <td key={col} className="max-w-40 truncate px-2 py-1">
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <span>
                {t('overwrite')}
                <span className="block text-xs text-muted">{t('overwriteHint')}</span>
              </span>
            </label>
            <span className="ml-auto">
              <button type="button" className={btn.primary} disabled={!ready || busy} onClick={run}>
                {t('run', { count: preview.totalRows })}
              </button>
            </span>
          </div>
          {!ready && <p className="mt-2 text-xs text-muted">{t(kind === 'employees' ? 'nameNeededEmployees' : 'nameNeeded')}</p>}
        </section>
      )}

      {/* Step 3: what happened */}
      {result && (
        <section className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm shadow-sm">
          <p className="font-medium">{t('result', result)}</p>
          <Link href={LIST_OF[kind]} className={`${btn.primarySm} mt-3`}>
            {t(`toList_${kind}`)}
          </Link>
        </section>
      )}
    </div>
  )
}
