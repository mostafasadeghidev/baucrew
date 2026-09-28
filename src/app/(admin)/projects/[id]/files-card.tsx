import { getLocale, getTranslations } from 'next-intl/server'
import { Paperclip } from 'lucide-react'
import { formatFileSize, previewKind } from '@/lib/files'
import { linkLabel, linkSite } from '@/lib/card-links'
import { AttachmentList, type AttachmentRow } from './attachment-list'
import { AttachButton } from './attach-panel'
import { LinkList, type LinkRow } from './link-list'

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

export type CardLinkRow = { id: string; url: string; title: string | null; createdAt: Date; createdBy: { username: string } | null }

/**
 * What is attached to the project — offers, plans, e-mails, photos, and web
 * addresses — laid out the way a Trello card lists its attachments:
 * "Anhänge" with "Hinzufügen" in its head (Trello's attach window: a file, or
 * a link), the links first, then a line per file, newest first. Files can
 * also simply be dropped on the card (card-drop-zone.tsx).
 */
export async function FilesCard({
  projectId,
  files,
  links = [],
  coverId = null,
}: {
  projectId: string
  files: FileRow[]
  links?: CardLinkRow[]
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

  const linkRows: LinkRow[] = links.map((link) => ({
    id: link.id,
    url: link.url,
    title: link.title,
    label: linkLabel(link.url, link.title),
    meta: [linkSite(link.url), t('added', { date: fmt.format(link.createdAt) }), link.createdBy?.username].filter(Boolean).join(' · '),
  }))

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-3 text-base font-semibold" title={t('hint')}>
          <Paperclip className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          {t('attachments')}
        </h2>
        <AttachButton
          projectId={projectId}
          label={t('attachTitle')}
          className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          {t('add')}
        </AttachButton>
      </div>
      <div className="mt-3 pl-8">
        {linkRows.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-xs font-semibold text-muted">{t('linksHeading')}</p>
            <LinkList rows={linkRows} />
          </div>
        )}
        {rows.length > 0 && <p className="mb-1 text-xs font-semibold text-muted">{t('filesHeading')}</p>}
        {(rows.length > 0 || linkRows.length === 0) && <AttachmentList projectId={projectId} rows={rows} />}
      </div>
    </section>
  )
}
