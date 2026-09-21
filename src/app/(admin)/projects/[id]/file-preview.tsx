'use client'

/**
 * A project file's name. For what a browser can draw — a PDF, a picture, plain
 * text — a click opens it over the project instead of sending the reader to
 * another tab: an offer is read beside the project it belongs to, and closing
 * it lands back where the reader was. Anything else opens in a tab as before.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Download, ExternalLink, X } from 'lucide-react'
import { lockPageScroll } from '@/lib/scroll-lock'
import type { PreviewKind } from '@/lib/files'

const nameClass = 'min-w-0 flex-1 truncate text-left font-medium text-accent hover:underline'
const barButton = 'rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground'

export function FilePreview({
  id,
  filename,
  kind,
  labels,
}: {
  id: string
  filename: string
  /** How the browser can draw it; null when it cannot. */
  kind: PreviewKind | null
  labels: { preview: string; openInTab: string; download: string; close: string }
}) {
  const [open, setOpen] = useState(false)
  // A portal needs the document; the server has none.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const href = `/api/files/${id}`

  useEffect(() => {
    if (!open) return
    const unlock = lockPageScroll()
    // Heard before anybody else and kept: under the viewer there may be the
    // card's sheet, which closes on the same key.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      unlock()
    }
  }, [open])

  if (!kind) {
    return (
      <a href={href} target="_blank" className={nameClass}>
        {filename}
      </a>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={labels.preview} className={nameClass}>
        {filename}
      </button>
      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex flex-col p-3 sm:p-6">
            <div aria-hidden className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={filename}
              className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            >
              <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{filename}</p>
                <a href={href} target="_blank" title={labels.openInTab} aria-label={labels.openInTab} className={barButton}>
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
                <a href={href} download={filename} title={labels.download} aria-label={labels.download} className={barButton}>
                  <Download className="h-4 w-4" aria-hidden />
                </a>
                <button type="button" onClick={() => setOpen(false)} title={labels.close} aria-label={labels.close} className={barButton}>
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {kind === 'image' ? (
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-subtle p-3">
                  {/* A stored upload behind a session: not a static asset the image optimiser could fetch. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={href} alt={filename} className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <iframe src={href} title={filename} className="min-h-0 w-full flex-1 bg-white" />
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
