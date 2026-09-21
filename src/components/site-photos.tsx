'use client'

/**
 * Photos of the site, taken where the work is: one button that opens the
 * phone's camera (or its gallery), and the pictures sent so far as small
 * tiles. A picture is drawn smaller before it leaves the phone — see
 * `@/lib/photo-upload` — so it arrives over a site's mobile network too.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Camera } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { FilePreview } from '@/components/file-preview'
import { uploadProjectPhoto } from '@/lib/photo-upload'

export function SitePhotos({
  projectId,
  photos,
  large = false,
}: {
  projectId: string
  photos: Array<{ id: string; filename: string }>
  /** Larger targets, for the phone. */
  large?: boolean
}) {
  const t = useTranslations('files')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = (list: FileList | null) => {
    const chosen = Array.from(list ?? [])
    if (chosen.length === 0) return
    setError(null)
    setProgress({ done: 0, total: chosen.length })
    startTransition(async () => {
      let failed = 0
      for (const [i, file] of chosen.entries()) {
        const result = await uploadProjectPhoto(projectId, file)
        if ('error' in result) failed++
        setProgress({ done: i + 1, total: chosen.length })
      }
      setProgress(null)
      if (failed > 0) setError(t('photoFailed', { count: failed }))
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((photo) => (
          <FilePreview
            key={photo.id}
            id={photo.id}
            filename={photo.filename}
            kind="image"
            thumb
            thumbClass={large ? 'h-20 w-20' : 'h-16 w-16'}
            labels={{ preview: t('preview'), openInTab: t('openInTab'), download: t('download'), close: tc('close') }}
          />
        ))}
        <label className={`${large ? btn.outline : btn.outlineSm} cursor-pointer gap-1.5 ${pending ? 'pointer-events-none opacity-60' : ''}`}>
          <Camera className="h-4 w-4" aria-hidden />
          {progress ? t('photoSending', { done: progress.done, total: progress.total }) : t('photoAdd')}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              send(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
