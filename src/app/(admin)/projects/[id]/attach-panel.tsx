'use client'

/**
 * Trello's "Anhängen": a file from the computer — several at once, e-mails
 * from Outlook among them — or a web address with the words it is shown
 * with. Opened from the attachments' "Hinzufügen" and from "+ Hinzufügen"
 * under the card's title.
 */

import { useCallback, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Popover, PopoverHead } from '@/components/ui/popover'
import { btn } from '@/components/ui/button'
import { ACCEPT_UPLOADS } from '@/lib/files'
import { uploadProjectFiles } from './upload-files'
import { useUploadMessage } from './file-upload'
import { addCardLink } from './file-actions'

const FIELD =
  'mt-1 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

export function AttachPanel({ projectId, close, back = null }: { projectId: string; close: () => void; back?: (() => void) | null }) {
  const t = useTranslations('files')
  const tc = useTranslations('common')
  const tp = useTranslations('projects')
  const router = useRouter()
  const message = useUploadMessage()
  const input = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [sending, setSending] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function send(files: File[]) {
    setError(null)
    setSending(true)
    const { failed } = await uploadProjectFiles(projectId, files)
    setSending(false)
    if (failed.length > 0) {
      setError(message(failed))
      router.refresh()
      return
    }
    close()
    router.refresh()
  }

  const insert = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await addCardLink(projectId, url, title)
      if (result.error) {
        setError(result.error === 'invalidLink' ? t('linkInvalid') : tc('saveFailed'))
        return
      }
      close()
      router.refresh()
    })
  }

  return (
    <>
      <PopoverHead title={t('attachTitle')} close={close} closeLabel={tc('close')} back={back} backLabel={tp('templateBack')} />
      <p className="text-sm font-semibold">{t('attachFromComputer')}</p>
      <p className="mt-0.5 text-xs text-muted">{t('attachDropHint')}</p>
      <input
        ref={input}
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
      <button
        type="button"
        disabled={sending}
        onClick={() => input.current?.click()}
        className="mt-2 w-full rounded-md bg-subtle px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-60"
      >
        {sending ? t('attachSending') : t('attachChoose')}
      </button>
      <hr className="my-3 border-border" />
      <form onSubmit={insert} className="space-y-2">
        <label className="block text-[11px] font-semibold text-muted">
          {t('attachLink')}
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('attachLinkPlaceholder')} inputMode="url" maxLength={2000} className={FIELD} />
        </label>
        <label className="block text-[11px] font-semibold text-muted">
          {t('attachText')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('attachTextPlaceholder')} maxLength={200} className={FIELD} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            {tc('cancel')}
          </button>
          <button type="submit" disabled={pending || !url.trim()} className={btn.primarySm}>
            {t('attachInsert')}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </>
  )
}

/** A button that opens the attach window — the attachments' "Hinzufügen". */
export function AttachButton({ projectId, label, className, children }: { projectId: string; label: string; className: string; children: ReactNode }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={label} className={className}>
        {children}
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={label}>
        <AttachPanel projectId={projectId} close={close} />
      </Popover>
    </>
  )
}
