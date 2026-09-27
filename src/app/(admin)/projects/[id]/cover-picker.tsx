'use client'

/**
 * Trello's cover button on the card's back: one of the project's pictures, a
 * new one uploaded on the spot, or none. The cover stands across the top of
 * the card's back and on its front on the board.
 */

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Image as ImageIcon, X } from 'lucide-react'
import { Popover } from '@/components/ui/popover'
import { btn } from '@/components/ui/button'
import { setProjectCover } from './file-actions'
import { uploadProjectFiles } from './upload-files'
import { ROUND_BUTTON } from '../card-sheet'

export function CoverPicker({
  projectId,
  images,
  current,
}: {
  projectId: string
  /** The project's pictures a browser can draw, newest first. */
  images: Array<{ id: string; filename: string }>
  current: string | null
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const tf = useTranslations('files')
  const router = useRouter()
  const anchor = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const close = useCallback(() => setOpen(false), [])

  const choose = (id: string | null) =>
    startTransition(async () => {
      const result = await setProjectCover(projectId, id)
      if (result?.error) {
        setError(tc('saveFailed'))
        return
      }
      setOpen(false)
      router.refresh()
    })

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    const { ids, failed } = await uploadProjectFiles(projectId, [file])
    setBusy(false)
    if (failed.length > 0 || !ids[0]) {
      setError(failed[0] ? tf(failed[0].error) : tc('saveFailed'))
      return
    }
    choose(ids[0])
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => {
          setError(null)
          setOpen((o) => !o)
        }}
        title={t('coverTitle')}
        aria-label={t('coverTitle')}
        aria-expanded={open}
        className={ROUND_BUTTON}
      >
        <ImageIcon className="h-4 w-4" aria-hidden />
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={t('coverTitle')}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="w-full text-center text-sm font-semibold">{t('coverTitle')}</p>
          <button type="button" onClick={close} aria-label={tc('close')} className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="text-[11px] font-semibold text-muted">{t('coverAttachments')}</p>
        {images.length > 0 ? (
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                disabled={pending}
                onClick={() => choose(image.id)}
                title={image.filename}
                className={`h-14 overflow-hidden rounded-md bg-subtle ${image.id === current ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'hover:opacity-90'}`}
              >
                {/* The project's own picture, served by the app; nothing for next/image to do. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${image.id}`} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-muted">{t('coverNone')}</p>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
            e.target.value = ''
          }}
        />
        <button type="button" disabled={busy || pending} onClick={() => input.current?.click()} className={`${btn.outlineSm} mt-3 w-full`}>
          {busy ? t('coverUploading') : t('coverUpload')}
        </button>
        {current && (
          <button type="button" disabled={pending} onClick={() => choose(null)} className={`${btn.ghost} mt-1 w-full`}>
            {t('coverRemove')}
          </button>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </Popover>
    </>
  )
}
