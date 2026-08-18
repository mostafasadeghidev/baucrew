'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { restoreBackup, type RestoreState } from './actions'
import { btn } from '@/components/ui/button'

export function BackupRestore() {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<RestoreState, FormData>(restoreBackup, {})

  return (
    <div className="max-w-2xl space-y-4">
      <a
        href="/settings/backup"
        className={btn.primary}
      >
        {t('downloadBackup')}
      </a>

      <div className="rounded-lg border border-danger/40 bg-danger/5 p-4">
        <p className="text-sm font-semibold">{t('restoreBackup')}</p>
        <p className="mt-1 text-sm text-muted">{t('restoreHint')}</p>
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!confirm(t('restoreConfirm'))) e.preventDefault()
          }}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input
            type="file"
            name="backup"
            accept="application/json,.json"
            required
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-danger/60 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
          >
            {pending ? tc('loading') : t('restoreBackup')}
          </button>
        </form>
        {state.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {state.error === 'restoreInvalid' ? t('restoreInvalid') : tc('saveFailed')}
          </p>
        )}
      </div>
    </div>
  )
}
