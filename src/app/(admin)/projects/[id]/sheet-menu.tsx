'use client'

/**
 * The "…" at the top of the card's back, where Trello keeps what is done to a
 * card as a whole: the work order, the offer's e-mail, reopening, archiving,
 * the full page, editing everything at once, and deleting.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Archive, ArchiveRestore, ExternalLink, Mail, MoreHorizontal, Pencil, Printer, RotateCcw, Trash2 } from 'lucide-react'
import { Menu, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { archiveProject, deleteProject } from '../actions'
import { reopenProject } from '../../schedule/actions'
import { PROJECT_EDIT_ALL_EVENT } from '../project-form'
import { ROUND_BUTTON } from '../card-sheet'

export function SheetMenu({
  projectId,
  projectLabel,
  archived,
  closeTo,
  reopenable,
  offerMail,
  canDelete,
}: {
  projectId: string
  projectLabel: string
  archived: boolean
  /** The board the card was opened over — where archiving it returns to. */
  closeTo: string
  reopenable: boolean
  offerMail: { href: string; title: string } | null
  canDelete: boolean
}) {
  const t = useTranslations('projects')
  const ts = useTranslations('schedule')
  const tsheet = useTranslations('sheet')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [ask, setAsk] = useState<'reopen' | 'delete' | null>(null)
  const [failed, setFailed] = useState(false)

  const archive = () =>
    startTransition(async () => {
      setFailed(false)
      const result = await archiveProject(projectId, !archived)
      if (result?.error) {
        setFailed(true)
        return
      }
      if (!archived) {
        const url = new URL(closeTo, window.location.origin)
        url.searchParams.delete('card')
        router.replace(`${url.pathname}${url.search}`, { scroll: false })
      } else router.refresh()
    })

  return (
    <>
      <Menu side="bottom" align="end" label={t('sheetMore')} className={ROUND_BUTTON} trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}>
        <Link href={`/projects/${projectId}/sheet`} role="menuitem" className={menuItemClass}>
          <Printer className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          {tsheet('title')}
        </Link>
        {offerMail && (
          <a href={offerMail.href} role="menuitem" title={offerMail.title} className={menuItemClass}>
            <Mail className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            {t('offerMail')}
          </a>
        )}
        <Link href={`/projects/${projectId}`} role="menuitem" className={menuItemClass}>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          {t('cardOpenFull')}
        </Link>
        <button type="button" role="menuitem" className={menuItemClass} onClick={() => window.dispatchEvent(new CustomEvent(PROJECT_EDIT_ALL_EVENT))}>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          {t('sheetEditAll')}
        </button>
        <MenuSeparator />
        {reopenable && (
          <button type="button" role="menuitem" className={menuItemClass} onClick={() => setAsk('reopen')}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            {ts('reopenProject')}
          </button>
        )}
        <button type="button" role="menuitem" className={menuItemClass} disabled={pending} onClick={archive}>
          {archived ? <ArchiveRestore className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /> : <Archive className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />}
          {archived ? t('cardRestore') : t('cardArchive')}
        </button>
        {canDelete && (
          <button type="button" role="menuitem" className={`${menuItemClass} text-danger`} onClick={() => setAsk('delete')}>
            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {tc('delete')}
          </button>
        )}
        {failed && (
          <p role="alert" className="px-2 py-1 text-xs text-danger">
            {tc('saveFailed')}
          </p>
        )}
      </Menu>
      <AlertDialog
        open={ask === 'reopen'}
        title={ts('reopenProject')}
        description={ts('reopenProjectConfirm', { project: projectLabel })}
        confirmLabel={ts('reopenProject')}
        cancelLabel={tc('cancel')}
        pending={pending}
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          setAsk(null)
          startTransition(async () => {
            await reopenProject(projectId)
            router.refresh()
          })
        }}
      />
      <AlertDialog
        open={ask === 'delete'}
        title={tc('delete')}
        description={t('deleteConfirm')}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          setAsk(null)
          startTransition(async () => {
            await deleteProject(projectId, {}, new FormData())
          })
        }}
      />
    </>
  )
}
