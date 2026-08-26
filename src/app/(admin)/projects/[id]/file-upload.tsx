'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Paperclip } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { ALLOWED_MIME_TYPES } from '@/lib/files'

/** Picks a file and posts it to the upload route, then refreshes the list. */
export function FileUpload({ projectId }: { projectId: string }) {
  const t = useTranslations('files')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function upload(file: File) {
    setError(null)
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setError(
        data.error === 'tooLarge' ? t('tooLarge') : data.error === 'badType' ? t('badType') : t('uploadFailed')
      )
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIME_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        className={btn.outlineSm}
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="h-4 w-4" aria-hidden />
        {t('upload')}
      </button>
      <span className="text-xs text-muted">{t('uploadHint')}</span>
      {error && <span className="text-xs text-red-700 dark:text-red-400">{error}</span>}
    </div>
  )
}
