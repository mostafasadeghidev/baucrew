'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Paperclip } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { ACCEPT_UPLOADS } from '@/lib/files'
import { uploadProjectFiles, type UploadFailure } from './upload-files'

/** What went wrong with an upload, in one line: the file's own reason, or how many failed. */
export function useUploadMessage() {
  const t = useTranslations('files')
  return (failed: UploadFailure[]) =>
    failed.length === 1
      ? `${failed[0].name}: ${t(failed[0].error)}`
      : t('uploadSomeFailed', { count: failed.length })
}

/**
 * Picks files — several at once, e-mails from Outlook among them — and sends
 * them onto the project, then refreshes the list. `compact` is the button in
 * the attachments' head, the way Trello puts "Hinzufügen" there.
 */
export function FileUpload({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const t = useTranslations('files')
  const router = useRouter()
  const message = useUploadMessage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [pending, startTransition] = useTransition()

  async function send(files: File[]) {
    setError(null)
    setSending(true)
    const { failed } = await uploadProjectFiles(projectId, files)
    setSending(false)
    if (failed.length > 0) setError(message(failed))
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_UPLOADS}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) void send(files)
          e.target.value = ''
        }}
      />
      <button type="button" className={btn.outlineSm} disabled={pending || sending} onClick={() => inputRef.current?.click()}>
        <Paperclip className="h-4 w-4" aria-hidden />
        {compact ? t('add') : t('upload')}
      </button>
      {!compact && <span className="text-xs text-muted">{t('uploadHint')}</span>}
      {error && (
        <span role="alert" className="basis-full text-xs text-red-700 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
