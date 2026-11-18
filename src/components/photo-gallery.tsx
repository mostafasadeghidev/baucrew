'use client'

/**
 * Photos as tiles; a tap opens them large, one after the other — arrows,
 * keys or a swipe. The documentation's photos and a task's photos alike.
 * Where the reader may delete a photo, the large view has a bin for it.
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { lockPageScroll } from '@/lib/scroll-lock'

export type GalleryPhoto = { id: string; filename: string; href: string; deletable?: boolean }

export function PhotoGallery({
  photos,
  tileClass = 'h-20 w-20',
  onDelete,
}: {
  photos: GalleryPhoto[]
  /** The tiles' size, as classes. */
  tileClass?: string
  /** Takes one photo away; offered on the photos marked `deletable`. */
  onDelete?: (id: string) => Promise<void>
}) {
  const t = useTranslations('photos')
  const tc = useTranslations('common')
  const [open, setOpen] = useState<number | null>(null)
  const [removing, setRemoving] = useState(false)
  const [pending, startTransition] = useTransition()
  const swipeFrom = useRef<number | null>(null)
  const count = photos.length
  const step = (by: number) => setOpen((i) => (i === null ? i : (i + by + count) % count))

  useEffect(() => {
    if (open === null) return
    const unlock = lockPageScroll()
    // Heard before the card's sheet, which closes on the same Escape.
    const onKey = (e: KeyboardEvent) => {
      // The question "Foto löschen?" answers its own keys.
      if (document.querySelector('[role=alertdialog]')) return
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setOpen(null)
      } else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      unlock()
    }
    // `step` only reads the count, which does not change while the view is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open === null])

  // A photo taken away while open: the view stays on the one that took its place.
  const current = open === null || count === 0 ? null : photos[Math.min(open, count - 1)]
  const nav = 'absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70'

  const remove = () => {
    if (!current || !onDelete) return
    const id = current.id
    startTransition(async () => {
      await onDelete(id)
      setRemoving(false)
      if (count <= 1) setOpen(null)
    })
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setOpen(index)}
            title={photo.filename}
            aria-label={`${t('open')}: ${photo.filename}`}
            className={`${tileClass} shrink-0 overflow-hidden rounded-md border border-border bg-subtle transition-shadow hover:ring-2 hover:ring-accent`}
          >
            {/* A stored upload behind a session: not a static asset the image optimiser could fetch. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.href} alt={photo.filename} loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {current &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={current.filename}
            className="fixed inset-0 z-[80] flex flex-col bg-black/90"
            onTouchStart={(e) => (swipeFrom.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const from = swipeFrom.current
              const to = e.changedTouches[0]?.clientX
              swipeFrom.current = null
              if (from === null || to === undefined || Math.abs(to - from) < 50 || count < 2) return
              step(to < from ? 1 : -1)
            }}
          >
            <div className="flex shrink-0 items-center gap-2 px-4 py-3 text-white">
              <p className="min-w-0 flex-1 truncate text-sm">
                {current.filename}
                {count > 1 && <span className="ml-2 text-white/60">{t('of', { index: (open ?? 0) + 1, count })}</span>}
              </p>
              {onDelete && current.deletable && (
                <button type="button" onClick={() => setRemoving(true)} aria-label={t('delete')} className="rounded-md p-2 hover:bg-white/10">
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              )}
              <button type="button" onClick={() => setOpen(null)} aria-label={tc('close')} className="rounded-md p-2 hover:bg-white/10">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center p-3" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.href} alt={current.filename} className="max-h-full max-w-full object-contain" />
              {count > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} aria-label={t('prev')} className={`${nav} left-3`}>
                    <ChevronLeft className="h-6 w-6" aria-hidden />
                  </button>
                  <button type="button" onClick={() => step(1)} aria-label={t('next')} className={`${nav} right-3`}>
                    <ChevronRight className="h-6 w-6" aria-hidden />
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
      <AlertDialog
        open={removing}
        title={t('deleteTitle')}
        description={current?.filename ?? ''}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onCancel={() => setRemoving(false)}
        onConfirm={remove}
      />
    </>
  )
}
