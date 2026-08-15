'use client'

import { useActionState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { resetLogo, uploadLogo, type LogoState } from './actions'
import { SavedToast } from '@/components/saved-toast'

export function LogoUploader({ hasLogo }: { hasLogo: boolean }) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<LogoState, FormData>(uploadLogo, {})
  const [resetPending, startReset] = useTransition()

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-4">
        {hasLogo ? (
          <span className="rounded bg-white p-2">
            {/* Plain img: the /logo response changes at runtime after uploads */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo" alt={t('logoTitle')} className="h-12 w-auto" />
          </span>
        ) : (
          <span className="text-sm text-muted">{t('noLogo')}</span>
        )}
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            required
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
          >
            {t('uploadLogo')}
          </button>
          <button
            type="button"
            disabled={resetPending}
            onClick={() => startReset(() => resetLogo())}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover disabled:opacity-60"
          >
            {t('resetLogo')}
          </button>
          <SavedToast trigger={state.savedAt} />
        </form>
      </div>
      <p className="text-xs text-muted">{t('logoHint')}</p>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === 'saveFailed' ? tc('saveFailed') : t(state.error)}
        </p>
      )}
    </div>
  )
}
