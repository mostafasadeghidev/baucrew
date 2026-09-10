'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FileSpreadsheet } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { IMPORT_FIELDS, type ImportField, type ImportMapping, type ImportProfile } from '@/lib/import-excel'
import { deleteImportProfile, saveImportProfile } from './actions'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

type Preview = { headers: string[]; rows: Array<Array<string | number>>; totalRows: number }
type RunResult = { created: number; updated: number; skipped: number }

/**
 * Upload → map columns (or apply a saved profile) → import as drafts.
 * The file itself never leaves the browser between the two requests.
 */
export function ImportWizard({ profiles }: { profiles: ImportProfile[] }) {
  const t = useTranslations('importExcel')
  const tc = useTranslations('common')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [profileName, setProfileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  async function loadFile(picked: File) {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', picked)
      const res = await fetch('/api/import/preview', { method: 'POST', body })
      if (!res.ok) {
        setError(t('parseFailed'))
        return
      }
      const data = (await res.json()) as Preview
      setFile(picked)
      setPreview(data)
      // Same header name as a target field? Pre-map it.
      const auto: ImportMapping = {}
      for (const field of IMPORT_FIELDS) {
        const hit = data.headers.find((h) => h.toLowerCase() === field.toLowerCase())
        if (hit) auto[field] = hit
      }
      setMapping(auto)
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    if (!file || !mapping.name) return
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('mapping', JSON.stringify(mapping))
      const res = await fetch('/api/import/run', { method: 'POST', body })
      if (!res.ok) {
        setError(t('runFailed'))
        return
      }
      setResult((await res.json()) as RunResult)
      startTransition(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Step 1: the file */}
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{t('step1')}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void loadFile(file)
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
        {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      </section>

      {/* Step 2: mapping + preview */}
      {preview && (
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('step2')}</h2>
            {profiles.length > 0 && (
              <div className="flex items-center gap-2">
                <Select
                  compact
                  className="min-w-44"
                  value=""
                  aria-label={t('applyProfile')}
                  onChange={(e) => {
                    const p = profiles.find((x) => x.name === e.target.value)
                    if (p) {
                      setMapping(p.mapping)
                      setProfileName(p.name)
                    }
                  }}
                >
                  <option value="">{t('applyProfile')}</option>
                  {profiles.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((field) => (
              <label key={field} className="block text-sm">
                {t(`field_${field}` as 'field_name')}
                {field === 'name' && <span className="text-red-600"> *</span>}
                <Select
                  className="mt-1 w-full"
                  value={mapping[field] ?? ''}
                  onChange={(e) =>
                    setMapping((prev) => {
                      const next = { ...prev }
                      if (e.target.value) next[field as ImportField] = e.target.value
                      else delete next[field as ImportField]
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

          {/* Preview of the first rows */}
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

          {/* Save the mapping as a profile for next month's file */}
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              {t('profileName')}
              <input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder={t('profileHint')}
                className={`${inputClass} min-w-56`}
              />
            </label>
            <button
              type="button"
              className={btn.outlineSm}
              disabled={!profileName.trim() || busy}
              onClick={() =>
                startTransition(async () => {
                  await saveImportProfile(profileName, JSON.stringify(mapping))
                })
              }
            >
              {t('saveProfile')}
            </button>
            {profiles.some((p) => p.name === profileName.trim()) && (
              <button
                type="button"
                className={btn.outlineSm}
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    await deleteImportProfile(profileName.trim())
                    setProfileName('')
                  })
                }
              >
                {t('deleteProfile')}
              </button>
            )}
            <span className="ml-auto">
              <button type="button" className={btn.primary} disabled={!mapping.name || busy} onClick={run}>
                {t('run', { count: preview.totalRows })}
              </button>
            </span>
          </div>
          {!mapping.name && <p className="mt-2 text-xs text-muted">{t('nameNeeded')}</p>}
        </section>
      )}

      {/* Step 3: result */}
      {result && (
        <section className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm shadow-sm">
          <p className="font-medium">
            {t('result', { created: result.created, updated: result.updated, skipped: result.skipped })}
          </p>
          <Link href="/projects/drafts" className={`${btn.primarySm} mt-3`}>
            {t('toDrafts')}
          </Link>
        </section>
      )}
    </div>
  )
}
