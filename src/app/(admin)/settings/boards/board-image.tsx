'use client'

/**
 * A photo as a board's ground, the way Trello's boards wear one: uploaded
 * here, shown small, taken away again. Chosen, it stands behind the lists
 * instead of the colour; the colour stays for when there is none.
 */

import { useActionState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { SavedToast } from '@/components/saved-toast'
import { btn } from '@/components/ui/button'
import { removeBoardImage, uploadBoardImage, type BoardImageState } from './actions'

export function BoardImage({ boardId, image }: { boardId: string; image: string | null }) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<BoardImageState, FormData>(uploadBoardImage.bind(null, boardId), {})
  const [removing, startRemove] = useTransition()

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">{t('boardImage')}</p>
      <div className="flex flex-wrap items-center gap-3">
        {image ? (
          // The board's own photo, served by the app; next/image has nothing to optimise here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/boards/${boardId}/background?v=${encodeURIComponent(image)}`} alt="" className="h-12 w-20 rounded-md object-cover" />
        ) : (
          <span className="text-xs text-muted">{t('boardImageNone')}</span>
        )}
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="image"
            accept="image/png,image/jpeg,image/webp"
            required
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <button type="submit" disabled={pending} className={btn.primarySm}>
            {t('boardImageUpload')}
          </button>
          {image && (
            <button type="button" disabled={removing} onClick={() => startRemove(() => removeBoardImage(boardId))} className={btn.outlineSm}>
              {t('boardImageRemove')}
            </button>
          )}
          <SavedToast trigger={state.savedAt} />
        </form>
      </div>
      <p className="text-xs text-muted">{t('boardImageHint')}</p>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === 'saveFailed' ? tc('saveFailed') : t(state.error === 'invalidType' ? 'boardImageInvalidType' : 'boardImageTooLarge')}
        </p>
      )}
    </div>
  )
}
