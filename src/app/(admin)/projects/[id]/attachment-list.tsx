'use client'

/**
 * A card's attachments the way Trello lists them: one line each — a tile that
 * is the picture itself or the kind of file written large, the name, when it
 * was added and by whom — and at the end of the line "open" and a "…" menu
 * with what can be done to it. The first few show; the rest are one click
 * away, as "Alle Anhänge anzeigen (n ausgeblendet)".
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Download, ExternalLink, Eye, EyeOff, Image as ImageIcon, MoreHorizontal, Trash2 } from 'lucide-react'
import { Menu, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { FilePreview } from '@/components/file-preview'
import type { PreviewKind } from '@/lib/files'
import { removeProjectFile, setProjectCover, toggleFileVisibility } from './file-actions'

export type AttachmentRow = {
  id: string
  filename: string
  kind: PreviewKind | null
  /** The ending, written large on the tile of a file that is not a picture: PDF, MSG … */
  ext: string
  /** "12.08.2026 · jr · 1.2 MB · Mangel", already put together. */
  meta: string
  visibleToCrew: boolean
  isCover: boolean
}

/** Up to this many lines before "show all". */
const FIRST = 6

/** The tile of a file that is not a picture: the kind written large on grey, as Trello draws it. */
const TILE = 'bg-subtle text-foreground/70'

export function AttachmentList({ projectId, rows }: { projectId: string; rows: AttachmentRow[] }) {
  const t = useTranslations('files')
  const tc = useTranslations('common')
  const router = useRouter()
  const [all, setAll] = useState(false)
  const [removing, setRemoving] = useState<AttachmentRow | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const labels = { preview: t('preview'), openInTab: t('openInTab'), download: t('download'), close: tc('close') }
  const shown = all ? rows : rows.slice(0, FIRST)
  const hidden = rows.length - shown.length

  const run = (task: () => Promise<unknown>) =>
    startTransition(async () => {
      setError(null)
      const result = (await task()) as { error?: string } | void
      if (result && result.error) setError(tc('saveFailed'))
      router.refresh()
    })

  if (rows.length === 0) return <p className="text-sm text-muted">{t('none')}</p>

  return (
    <div>
      <ul className="divide-y divide-border">
        {shown.map((row) => (
          <li key={row.id} className="flex items-center gap-3 py-2">
            {row.kind === 'image' ? (
              <FilePreview id={row.id} filename={row.filename} kind="image" thumb thumbClass="h-12 w-16 shrink-0 rounded-md" labels={labels} />
            ) : (
              <span
                aria-hidden
                className={`flex h-12 w-16 shrink-0 items-center justify-center rounded-md text-xs font-bold tracking-wide ${TILE}`}
              >
                {row.ext || '—'}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 text-sm">
                <FilePreview
                  id={row.id}
                  filename={row.filename}
                  kind={row.kind}
                  labels={labels}
                  nameClassName="min-w-0 flex-1 truncate text-left font-semibold text-foreground hover:underline"
                />
              </div>
              <p className="truncate text-[11px] text-muted">
                {row.meta}
                {row.isCover && ` · ${t('isCover')}`}
                {row.visibleToCrew && ` · ${t('crewShort')}`}
              </p>
            </div>
            <a
              href={`/api/files/${row.id}`}
              target="_blank"
              rel="noreferrer"
              title={t('openInTab')}
              aria-label={t('openInTab')}
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
            <Menu
              side="bottom"
              align="end"
              label={t('rowMenu')}
              className="rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}
            >
              <a href={`/api/files/${row.id}`} download={row.filename} role="menuitem" className={menuItemClass}>
                <Download className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                {t('download')}
              </a>
              {row.kind === 'image' && (
                <button type="button" role="menuitem" className={menuItemClass} onClick={() => run(() => setProjectCover(projectId, row.isCover ? null : row.id))}>
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                  {row.isCover ? t('clearCover') : t('setCover')}
                </button>
              )}
              <button type="button" role="menuitem" className={menuItemClass} onClick={() => run(() => toggleFileVisibility(row.id))}>
                {row.visibleToCrew ? <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /> : <Eye className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />}
                {row.visibleToCrew ? t('makeOfficeOnly') : t('makeCrewVisible')}
              </button>
              <MenuSeparator />
              <button type="button" role="menuitem" className={`${menuItemClass} text-danger`} onClick={() => setRemoving(row)}>
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {tc('delete')}
              </button>
            </Menu>
          </li>
        ))}
      </ul>
      {(hidden > 0 || all) && rows.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-2 w-full rounded-md bg-subtle px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-hover"
        >
          {all ? t('showFewer') : t('showAll', { count: hidden })}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <AlertDialog
        open={removing !== null}
        title={t('deleteTitle')}
        description={removing ? <span className="block truncate">{removing.filename}</span> : ''}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const row = removing
          setRemoving(null)
          if (row) run(() => removeProjectFile(row.id))
        }}
      />
    </div>
  )
}
