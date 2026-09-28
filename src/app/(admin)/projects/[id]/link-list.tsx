'use client'

/**
 * The links attached to a card, above its files, the way Trello lists them:
 * a tile, the words or the address, the site and when it was added; the
 * address opens in a new tab, and the "…" changes it or takes it away.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ExternalLink, Link2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Menu, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'
import { editCardLink, removeCardLink } from './file-actions'

export type LinkRow = {
  id: string
  url: string
  title: string | null
  /** The words it is shown with, or the address without its protocol. */
  label: string
  /** "example.test · 12.08.2026 · jr", already put together. */
  meta: string
}

const FIELD =
  'mt-1 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

export function LinkList({ rows }: { rows: LinkRow[] }) {
  const t = useTranslations('files')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<{ id: string; url: string; title: string } | null>(null)
  const [removing, setRemoving] = useState<LinkRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setError(null)
    startTransition(async () => {
      const result = await editCardLink(editing.id, editing.url, editing.title)
      if (result.error) {
        setError(result.error === 'invalidLink' ? t('linkInvalid') : tc('saveFailed'))
        return
      }
      setEditing(null)
      router.refresh()
    })
  }

  return (
    <div>
      <ul className="divide-y divide-border">
        {rows.map((row) =>
          editing?.id === row.id ? (
            <li key={row.id} className="py-2">
              <form onSubmit={save} className="space-y-2">
                <label className="block text-[11px] font-semibold text-muted">
                  {t('attachLink')}
                  <input autoFocus value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} maxLength={2000} className={FIELD} />
                </label>
                <label className="block text-[11px] font-semibold text-muted">
                  {t('attachText')}
                  <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={200} className={FIELD} />
                </label>
                <div className="flex gap-2">
                  <button type="submit" disabled={pending} className={btn.primarySm}>
                    {tc('save')}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className={btn.ghost}>
                    {tc('cancel')}
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={row.id} className="flex items-center gap-3 py-2">
              <span aria-hidden className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-subtle text-foreground/60">
                <Link2 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <a href={row.url} target="_blank" rel="noreferrer noopener" className="block truncate text-sm font-semibold text-foreground hover:underline" title={row.url}>
                  {row.label}
                </a>
                <p className="truncate text-[11px] text-muted">{row.meta}</p>
              </div>
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer noopener"
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
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => {
                    setError(null)
                    setEditing({ id: row.id, url: row.url, title: row.title ?? '' })
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                  {tc('edit')}
                </button>
                <MenuSeparator />
                <button type="button" role="menuitem" className={`${menuItemClass} text-danger`} onClick={() => setRemoving(row)}>
                  <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t('linkRemove')}
                </button>
              </Menu>
            </li>
          )
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <AlertDialog
        open={removing !== null}
        title={t('linkRemoveTitle')}
        description={removing ? <span className="block truncate">{removing.label}</span> : ''}
        confirmLabel={t('linkRemove')}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const row = removing
          setRemoving(null)
          if (row)
            startTransition(async () => {
              const result = await removeCardLink(row.id)
              if (result.error) setError(tc('saveFailed'))
              router.refresh()
            })
        }}
      />
    </div>
  )
}
