'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Download, X } from 'lucide-react'
import type { FeedbackAttachmentDTO } from '@/lib/feedback'

/** A picture large, over the dashboard, with a way to download it and a way back. */
export function ImageViewer({ image, onClose }: { image: FeedbackAttachmentDTO; onClose: () => void }) {
  const t = useTranslations('feedback.detail')
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={image.filename} className="fixed inset-0 z-[70] flex flex-col bg-black/85 p-3 sm:p-6" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 pb-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="truncate text-sm">{image.filename}</p>
        <div className="flex items-center gap-1">
          <a href={`${image.url}?download`} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-white/10">
            <Download className="h-4 w-4" aria-hidden />
            {t('download')}
          </a>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('close')} title={t('close')} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- a protected file the route serves itself */}
        <img src={image.url} alt={image.filename} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg bg-white object-contain shadow-2xl" />
      </div>
    </div>,
    document.body
  )
}
