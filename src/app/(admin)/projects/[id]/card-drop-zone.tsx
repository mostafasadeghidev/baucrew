'use client'

/**
 * Files dropped anywhere on a project's card — an offer PDF from the desktop,
 * an e-mail dragged out of Outlook — are attached to it, the way a Trello
 * card takes whatever is let go over it. While files hover, a dashed frame
 * says where they will go; a card being moved on the board is no file and is
 * left alone.
 */

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { dragHasFiles, uploadProjectFiles } from './upload-files'
import { useUploadMessage } from './file-upload'

export function CardDropZone({ projectId, children, className = '' }: { projectId: string; children: ReactNode; className?: string }) {
  const t = useTranslations('files')
  const router = useRouter()
  const message = useUploadMessage()
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  // Entering a child fires "leave" on the parent: counted, so the frame stays while the pointer is inside.
  const depth = useRef(0)

  // A failure says its piece and goes; it is not a dialog to be closed.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(timer)
  }, [error])

  async function send(files: File[]) {
    setError(null)
    const { failed } = await uploadProjectFiles(projectId, files, (done, total) => setProgress({ done, total }))
    setProgress(null)
    if (failed.length > 0) setError(message(failed))
    startTransition(() => router.refresh())
  }

  return (
    <div
      className={`relative ${className}`}
      onDragEnter={(e) => {
        if (!dragHasFiles(e)) return
        e.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragOver={(e) => {
        if (!dragHasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        if (!dragHasFiles(e)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      }}
      onDrop={(e) => {
        if (!dragHasFiles(e)) return
        e.preventDefault()
        depth.current = 0
        setOver(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) void send(files)
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 z-30 rounded-xl border-2 border-dashed border-accent bg-accent/10">
          <p className="sticky top-32 mx-auto mt-24 w-fit rounded-lg bg-surface px-4 py-2 text-sm font-medium shadow-lg">{t('dropHere')}</p>
        </div>
      )}
      {(progress || error) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`fixed bottom-6 left-1/2 z-[90] max-w-md -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ${
            error ? 'bg-danger text-white' : 'bg-foreground text-background'
          }`}
          onClick={() => setError(null)}
        >
          {error ?? t('dropSending', { done: Math.min((progress?.done ?? 0) + 1, progress?.total ?? 1), total: progress?.total ?? 1 })}
        </p>
      )}
    </div>
  )
}
