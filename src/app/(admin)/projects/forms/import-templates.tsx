'use client'

/**
 * Templates brought in from a file another installation exported — or one
 * kept outside the app. Opens under the page's head; says what came in, what
 * was replaced and what was left out.
 */

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { importFormTemplates, type ImportState } from './actions'

export function ImportTemplates() {
  const t = useTranslations('forms')
  const tc = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<ImportState, FormData>(importFormTemplates, {})

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${btn.outline} gap-1.5`}>
        <Upload className="h-4 w-4" aria-hidden />
        {t('importOpen')}
      </button>
    )
  }

  const done = state.created !== undefined
  return (
    <form action={action} className="w-full space-y-3 rounded-lg border border-border bg-surface p-4 text-sm">
      <div>
        <p className="font-semibold">{t('importTitle')}</p>
        <p className="mt-0.5 text-xs text-muted">{t('importHint')}</p>
      </div>
      <input type="file" name="file" accept="application/json,.json" required className="block text-sm" />
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="replace" className="h-4 w-4 accent-[var(--accent)]" />
        {t('importReplace')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? t('importRunning') : t('importRun')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btn.outline}>
          {tc('close')}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error === 'newerVersion' ? t('importNewer') : state.error === 'noFile' ? t('importNoFile') : t('importNotAFile')}
        </p>
      )}
      {done && (
        <p role="status" className="text-emerald-700 dark:text-emerald-400">
          {t('importDone', { created: state.created ?? 0, updated: state.updated ?? 0 })}
          {(state.skipped ?? []).length > 0 && <span className="block text-muted">{t('importSkipped', { names: (state.skipped ?? []).join(', ') })}</span>}
        </p>
      )}
    </form>
  )
}
