'use client'

/**
 * A project's folders: the bar above its attachments and its documentation,
 * and the "Verschieben nach…" window. The bar is the way in — a breadcrumb
 * from the top level down to the open folder, the folders inside it as tiles
 * with how much each holds, "+ Ordner" — and the lists under it show what lies
 * in the open folder. Files are moved by dragging them onto a tile or a step
 * of the breadcrumb, or with "Verschieben nach…" from their menu (the phone's
 * way). Which folder is open is shared by every list of that project on the
 * page (see `useOpenFolder`), not written into the address.
 */

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition, type DragEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight, Folder, FolderInput, FolderPlus, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { Menu, menuItemClass } from '@/components/ui/menu'
import { AlertDialog } from '@/components/ui/alert-dialog'
import {
  FOLDER_DRAG_TYPE,
  FOLDER_MAX_DEPTH,
  childrenOf,
  folderCounts,
  folderPath,
  flattenTree,
  isFolderItem,
  type FolderItem,
  type FolderView,
} from '@/lib/folders'
import { createFolder, createStarterFolders, deleteFolder, moveToFolder, renameFolder } from '@/app/folder-actions'

// ── Which folder is open, per project, shared by the lists on the page ──

const open = new Map<string, string | null>()
const listeners = new Set<() => void>()

export function setOpenFolder(projectId: string, folderId: string | null) {
  open.set(projectId, folderId)
  listeners.forEach((l) => l())
}

/** The folder open on this project — null for the top level. */
export function useOpenFolder(projectId: string): string | null {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => open.get(projectId) ?? null,
    () => null
  )
}

/** What makes a file or an entry draggable onto a folder. */
export function dragItem(item: FolderItem) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(FOLDER_DRAG_TYPE, JSON.stringify(item))
      e.dataTransfer.effectAllowed = 'move'
    },
  }
}

const carriesItem = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(FOLDER_DRAG_TYPE)

/** A place a dragged file can be dropped on: a folder's tile, a step of the breadcrumb. */
function useDropTarget(projectId: string, folderId: string | null) {
  const router = useRouter()
  const [over, setOver] = useState(false)
  const [, startTransition] = useTransition()
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!carriesItem(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false)
        if (!carriesItem(e)) return
        e.preventDefault()
        // Heard here alone: the card's own drop zone takes files from the computer.
        e.stopPropagation()
        let item: unknown
        try {
          item = JSON.parse(e.dataTransfer.getData(FOLDER_DRAG_TYPE))
        } catch {
          return
        }
        if (!isFolderItem(item)) return
        const moving = item
        startTransition(async () => {
          await moveToFolder(projectId, [moving], folderId)
          router.refresh()
        })
      },
    },
  }
}

export function FolderBar({
  projectId,
  folders,
  itemFolderIds,
  canAdd,
  large = false,
  frame = true,
}: {
  projectId: string
  folders: FolderView[]
  /** The folder of every file and entry the reader sees — for the numbers on the tiles. */
  itemFolderIds: Array<string | null>
  canAdd: boolean
  large?: boolean
  /** Drawn as a card of its own; off where the page around it is the frame. */
  frame?: boolean
}) {
  const t = useTranslations('folders')
  const tc = useTranslations('common')
  const router = useRouter()
  const current = useOpenFolder(projectId)
  // A folder deleted, or one of another page: back to the top.
  const openId = current && folders.some((f) => f.id === current) ? current : null
  const path = folderPath(folders, openId)
  const here = path.at(-1) ?? null
  const inside = childrenOf(folders, openId)
  const counts = useMemo(() => folderCounts(folders, itemFolderIds), [folders, itemFolderIds])
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [removing, setRemoving] = useState(false)
  // An error belongs to the folder it happened in; it goes when another one is opened.
  const [error, setError] = useState<{ at: string | null; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const deepest = path.length >= FOLDER_MAX_DEPTH

  // Closing the card or leaving the page lets go of the open folder: the next
  // time the project opens, it opens at its main folder.
  useEffect(() => () => setOpenFolder(projectId, null), [projectId])

  const fail = (code?: string) => setError(code ? { at: openId, text: t(`error.${code}`) } : null)

  const submit = () => {
    const value = name
    startTransition(async () => {
      const result = renaming && here ? await renameFolder(here.id, value) : await createFolder(projectId, openId, value)
      if (result.error) return fail(result.error)
      fail()
      setAdding(false)
      setRenaming(false)
      setName('')
      router.refresh()
    })
  }

  const starters = () =>
    startTransition(async () => {
      const result = await createStarterFolders(projectId, t('starters').split(','))
      if (result.error) return fail(result.error)
      router.refresh()
    })

  const remove = () =>
    startTransition(async () => {
      if (!here) return
      const result = await deleteFolder(here.id)
      setRemoving(false)
      if (result.error) return fail(result.error)
      setOpenFolder(projectId, here.parentId)
      router.refresh()
    })

  const editing = adding || renaming
  return (
    <section aria-label={t('title')} className={frame ? 'rounded-xl border border-border bg-surface px-5 py-3' : ''}>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <Folder className="mr-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <nav aria-label={t('path')} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 gap-y-1">
          <Crumb projectId={projectId} folderId={null} active={openId === null} large={large}>
            {t('root')}
          </Crumb>
          {path.map((f) => (
            <span key={f.id} className="flex min-w-0 items-center gap-x-0.5">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <Crumb projectId={projectId} folderId={f.id} active={f.id === openId} large={large}>
                {f.name}
              </Crumb>
            </span>
          ))}
        </nav>
        {here?.canChange && !editing && (
          <Menu
            side="bottom"
            align="end"
            label={t('folderMenu')}
            className={`${large ? 'p-2' : 'p-1'} rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground`}
            trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}
          >
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                setName(here.name)
                setRenaming(true)
                fail()
              }}
            >
              <Pencil className="h-4 w-4 text-muted" aria-hidden />
              {t('rename')}
            </button>
            <button type="button" role="menuitem" className={`${menuItemClass} text-danger`} onClick={() => setRemoving(true)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {t('delete')}
            </button>
          </Menu>
        )}
        {canAdd && !editing && !deepest && (
          <button
            type="button"
            onClick={() => {
              setName('')
              setAdding(true)
              fail()
            }}
            className={`${large ? btn.outline : btn.outlineXs} gap-1.5`}
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
            {t('add')}
          </button>
        )}
      </div>

      {editing && (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            autoFocus
            data-sheet-draft
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              // The card closes on Escape too; here it only lets go of the name.
              e.stopPropagation()
              e.nativeEvent.stopImmediatePropagation()
              setAdding(false)
              setRenaming(false)
            }}
            placeholder={t('namePlaceholder')}
            aria-label={renaming ? t('rename') : t('add')}
            className={`min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 ${large ? 'h-11 text-base' : 'h-8 text-sm'} focus:outline-none focus:ring-2 focus:ring-ring`}
          />
          <button type="submit" disabled={pending || !name.trim()} className={large ? btn.primary : btn.primarySm}>
            {renaming ? tc('save') : t('create')}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setRenaming(false)
              fail()
            }}
            className={large ? btn.outline : btn.outlineSm}
          >
            {tc('cancel')}
          </button>
        </form>
      )}

      {inside.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {inside.map((f) => (
            <li key={f.id}>
              <FolderTile projectId={projectId} folder={f} count={counts.get(f.id) ?? 0} large={large} />
            </li>
          ))}
        </ul>
      )}

      {folders.length === 0 && canAdd && !editing && (
        <p className="mt-1.5 text-xs text-muted">
          {t('emptyHint')}{' '}
          <button type="button" disabled={pending} onClick={starters} className="font-medium text-accent hover:underline">
            {t('startersCreate', { names: t('starters').split(',').join(', ') })}
          </button>
        </p>
      )}

      {error && error.at === openId && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.text}
        </p>
      )}

      <AlertDialog
        open={removing}
        title={t('deleteTitle', { name: here?.name ?? '' })}
        description={t('deleteBody', {
          count: here ? (counts.get(here.id) ?? 0) : 0,
          target: path.length > 1 ? path[path.length - 2].name : t('root'),
        })}
        confirmLabel={t('delete')}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onCancel={() => setRemoving(false)}
        onConfirm={remove}
      />
    </section>
  )
}

function Crumb({ projectId, folderId, active, large, children }: { projectId: string; folderId: string | null; active: boolean; large: boolean; children: ReactNode }) {
  const drop = useDropTarget(projectId, folderId)
  return (
    <button
      type="button"
      onClick={() => setOpenFolder(projectId, folderId)}
      aria-current={active ? 'location' : undefined}
      {...drop.props}
      className={`max-w-[14rem] truncate rounded-md px-1.5 ${large ? 'py-1.5 text-base' : 'py-0.5 text-sm'} transition-colors ${
        active ? 'font-semibold text-foreground' : 'text-muted hover:bg-surface-hover hover:text-foreground'
      } ${drop.over ? 'bg-accent/15 ring-2 ring-accent' : ''}`}
    >
      {children}
    </button>
  )
}

function FolderTile({ projectId, folder, count, large }: { projectId: string; folder: FolderView; count: number; large: boolean }) {
  const drop = useDropTarget(projectId, folder.id)
  return (
    <button
      type="button"
      onClick={() => setOpenFolder(projectId, folder.id)}
      {...drop.props}
      className={`flex items-center gap-2 rounded-lg border border-border bg-subtle px-3 ${large ? 'h-12 text-base' : 'h-9 text-sm'} font-medium transition-colors hover:bg-surface-hover ${
        drop.over ? 'border-accent bg-accent/15 ring-2 ring-accent' : ''
      }`}
    >
      <Folder className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <span className="max-w-[12rem] truncate">{folder.name}</span>
      <span className="text-xs tabular-nums text-muted">{count}</span>
    </button>
  )
}

/**
 * "Verschieben nach…": the folder tree as a list to pick from, the top level
 * first. The folder the thing lies in is marked and cannot be picked.
 */
export function MoveDialog({
  projectId,
  folders,
  item,
  from,
  onClose,
}: {
  projectId: string
  folders: FolderView[]
  /** What is moved; null while the window is shut. */
  item: FolderItem | null
  from: string | null
  onClose: () => void
}) {
  const t = useTranslations('folders')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const tree = useMemo(() => flattenTree(folders), [folders])

  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [item, onClose])

  if (!mounted || !item) return null

  const pick = (folderId: string | null) =>
    startTransition(async () => {
      const result = await moveToFolder(projectId, [item], folderId)
      if (result.error) {
        setError(true)
        return
      }
      setError(false)
      onClose()
      router.refresh()
    })

  const row = (folderId: string | null, label: string, depth: number) => {
    const here = folderId === from
    return (
      <li key={folderId ?? 'root'}>
        <button
          type="button"
          disabled={here || pending}
          onClick={() => pick(folderId)}
          style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
          className="flex min-h-11 w-full items-center gap-2 rounded-md pr-3 text-left text-sm transition-colors hover:bg-surface-hover disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
        >
          <Folder className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {here && <span className="shrink-0 text-xs text-muted">{t('currentFolder')}</span>}
        </button>
      </li>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" aria-label={tc('close')} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div role="dialog" aria-modal="true" aria-label={t('moveTitle')} className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-t-xl border border-border bg-surface shadow-xl sm:rounded-xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <FolderInput className="h-4 w-4 text-muted" aria-hidden />
          <h2 className="flex-1 text-base font-semibold">{t('moveTitle')}</h2>
          <button type="button" onClick={onClose} aria-label={tc('close')} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {row(null, t('root'), 0)}
          {tree.map((f) => row(f.id, f.name, f.depth + 1))}
        </ul>
        {tree.length === 0 && <p className="px-4 pb-3 text-sm text-muted">{t('noFoldersYet')}</p>}
        {error && (
          <p role="alert" className="px-4 pb-3 text-sm text-danger">
            {t('error.moveFailed')}
          </p>
        )}
      </div>
    </div>,
    document.body
  )
}
