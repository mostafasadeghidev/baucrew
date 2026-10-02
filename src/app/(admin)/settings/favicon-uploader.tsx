'use client'

import { useActionState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { resetFavicon, uploadFavicon, type FaviconState } from './actions'
import { SavedToast } from '@/components/saved-toast'
import { btn } from '@/components/ui/button'

/**
 * The browser tab's icon, beside the logo: what the tab shows now — the image
 * uploaded, or the company's first letter on its colour — drawn the size it
 * has in the tab and a size larger.
 */
export function FaviconUploader({ hasFavicon, version }: { hasFavicon: boolean; version: string }) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<FaviconState, FormData>(uploadFavicon, {})
  const [resetPending, startReset] = useTransition()
  const src = `/brand-icon?v=${version}`

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex items-end gap-3 rounded-md border border-border bg-subtle px-3 py-2">
          {/* Plain img: the icon changes at runtime after an upload. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" width={16} height={16} className="h-4 w-4" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={t('faviconTitle')} width={40} height={40} className="h-10 w-10 rounded-lg" />
        </span>
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="favicon"
            accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.ico,.png,.svg"
            required
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <button type="submit" disabled={pending} className={btn.primarySm}>
            {t('uploadFavicon')}
          </button>
          {hasFavicon && (
            <button type="button" disabled={resetPending} onClick={() => startReset(() => resetFavicon())} className={btn.outlineSm}>
              {t('resetFavicon')}
            </button>
          )}
          <SavedToast trigger={state.savedAt} />
        </form>
      </div>
      <p className="text-xs text-muted">{hasFavicon ? t('faviconHint') : `${t('faviconAuto')} ${t('faviconHint')}`}</p>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === 'saveFailed' ? tc('saveFailed') : t(state.error)}
        </p>
      )}
    </div>
  )
}
