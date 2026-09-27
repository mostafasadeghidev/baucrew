import { getLocale, getTranslations } from 'next-intl/server'
import { formatFileSize, previewKind } from '@/lib/files'
import { FileUpload } from './file-upload'
import { AttachmentList, type AttachmentRow } from './attachment-list'

export type FileRow = {
  id: string
  filename: string
  mimeType: string
  /** True for a photo that shows a defect — it is drawn with the defect too. */
  defect?: boolean
  size: number
  source: string
  visibleToCrew: boolean
  createdAt: Date
  uploadedBy: { username: string } | null
}

/**
 * What is attached to the project — offers, plans, e-mails, photos — laid out
 * the way a Trello card lists its attachments: "Anhänge" with "Hinzufügen" in
 * its head, a line per file, newest first. Files can also simply be dropped
 * on the card (card-drop-zone.tsx).
 */
export async function FilesCard({
  projectId,
  files,
  coverId = null,
}: {
  projectId: string
  files: FileRow[]
  /** The photo on the front of the project's card, if one was chosen. */
  coverId?: string | null
}) {
  const [t, locale] = await Promise.all([getTranslations('files'), getLocale()])
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const rows: AttachmentRow[] = files.map((file) => ({
    id: file.id,
    filename: file.filename,
    kind: previewKind(file.mimeType),
    ext: (/\.([a-z0-9]{1,5})$/i.exec(file.filename)?.[1] ?? '').toUpperCase(),
    meta: [
      t('added', { date: fmt.format(file.createdAt) }),
      file.uploadedBy?.username,
      file.source === 'site' ? t('fromSite') : formatFileSize(file.size),
      file.defect ? t('ofDefect') : null,
      file.source !== 'manual' && file.source !== 'site' ? file.source : null,
    ]
      .filter(Boolean)
      .join(' · '),
    visibleToCrew: file.visibleToCrew,
    isCover: file.id === coverId,
  }))

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('attachments')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('hint')}</p>
        </div>
        <FileUpload projectId={projectId} compact />
      </div>
      <div className="px-5 py-3">
        <AttachmentList projectId={projectId} rows={rows} />
        <p className="mt-2 text-[11px] text-muted">{t('uploadHint')}</p>
      </div>
    </section>
  )
}
