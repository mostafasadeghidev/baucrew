'use client'

/**
 * Trello's keyboard on the board. A card is "the one" when the pointer rests
 * on it or when the arrow keys walked to it (a ring shows it); the keys then
 * act on it:
 *
 *   ← ↑ → ↓ / j k   walk between the cards and the lists
 *   Enter            open the card
 *   e                the card's quick menu (the pencil)
 *   t                rename it where it stands
 *   l  m  d          its labels, members, dates — the card opens with the window
 *   Space            put yourself on the card, or take yourself off
 *   s                follow it or stop ("Beobachten")
 *   c                archive it
 *   n                add a card at the foot of its list
 *   f  q  x  /       the filter, "my cards", no filter, the search
 *   ?                this list
 *
 * Nothing happens while something is being typed or a window is open over
 * the board — Escape belongs to that window then.
 */

import { useEffect, useRef, type RefObject } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { filterList } from '@/lib/board-cards'

type Column = { id: string; cards: Array<{ id: string; watching: boolean }> }

export type BoardKeyActions = {
  open: (id: string) => void
  pop: (id: string, which: 'labels' | 'members' | 'dates') => void
  quickEdit: (id: string) => void
  rename: (id: string) => void
  archive: (id: string) => void
  watch: (id: string, on: boolean) => void
  /** Null when the reader has no person behind the account to put on a card. */
  join: ((id: string) => void) | null
  add: (columnId: string) => void
  help: () => void
}

/** The card and list a card id stands at. */
function locate(columns: Column[], id: string | null): { col: number; row: number } | null {
  if (!id) return null
  for (let col = 0; col < columns.length; col++) {
    const row = columns[col].cards.findIndex((c) => c.id === id)
    if (row !== -1) return { col, row }
  }
  return null
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function useBoardKeys({
  columns,
  hovered,
  selected,
  setSelected,
  actions,
}: {
  columns: Column[]
  hovered: RefObject<string | null>
  selected: string | null
  setSelected: (id: string | null) => void
  actions: BoardKeyActions
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  // The handler reads what is current when a key is pressed, not what was current when it was made.
  const live = useRef({ columns, selected, actions, params })
  useEffect(() => {
    live.current = { columns, selected, actions, params }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      // A card, a popover, a dialog open over the board: its keys, not the board's.
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      const { columns, selected, actions, params } = live.current
      const card = selected ?? hovered.current
      const at = locate(columns, card)
      const address = (change: (p: URLSearchParams) => void) => {
        const next = new URLSearchParams(params)
        change(next)
        const qs = next.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      }
      const walk = (dc: number, dr: number) => {
        e.preventDefault()
        if (!at) {
          const first = columns.find((c) => c.cards.length > 0)
          if (first) setSelected(first.cards[0].id)
          return
        }
        let col = at.col + dc
        // Sideways, skip the lists that are empty.
        while (dc !== 0 && col >= 0 && col < columns.length && columns[col].cards.length === 0) col += dc
        if (col < 0 || col >= columns.length) return
        const row = Math.max(0, Math.min(columns[col].cards.length - 1, dc === 0 ? at.row + dr : at.row))
        const next = columns[col].cards[row]
        if (next) setSelected(next.id)
      }
      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          return walk(0, 1)
        case 'ArrowUp':
        case 'k':
          return walk(0, -1)
        case 'ArrowLeft':
          return walk(-1, 0)
        case 'ArrowRight':
          return walk(1, 0)
        case 'Enter':
          if (card) {
            e.preventDefault()
            actions.open(card)
          }
          return
        case 'Escape':
          if (selected) setSelected(null)
          return
        case 'e':
          if (card) {
            e.preventDefault()
            actions.quickEdit(card)
          }
          return
        case 't':
          if (card) {
            e.preventDefault()
            actions.rename(card)
          }
          return
        case 'l':
        case 'm':
        case 'd':
          if (card) {
            e.preventDefault()
            actions.pop(card, e.key === 'l' ? 'labels' : e.key === 'm' ? 'members' : 'dates')
          }
          return
        case ' ':
          if (card && actions.join) {
            e.preventDefault()
            actions.join(card)
          }
          return
        case 's':
          if (card && at) {
            e.preventDefault()
            actions.watch(card, !columns[at.col].cards[at.row].watching)
          }
          return
        case 'c':
          if (card) {
            e.preventDefault()
            actions.archive(card)
          }
          return
        case 'n': {
          e.preventDefault()
          const column = at ? columns[at.col] : columns[0]
          if (column) actions.add(column.id)
          return
        }
        case 'f':
          e.preventDefault()
          document.querySelector<HTMLButtonElement>('button[aria-label^="Filter"]')?.click()
          return
        case 'q':
          e.preventDefault()
          address((p) => {
            const members = filterList(p.get('member') ?? undefined)
            const next = members.includes('me') ? members.filter((m) => m !== 'me') : [...members, 'me']
            if (next.length > 0) p.set('member', next.join(','))
            else p.delete('member')
          })
          return
        case 'x':
          e.preventDefault()
          address((p) => {
            for (const key of ['member', 'label', 'urgent', 'due', 'done', 'activity']) p.delete(key)
          })
          return
        case '/':
          e.preventDefault()
          document.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
          return
        case '?':
          e.preventDefault()
          actions.help()
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hovered, pathname, router, setSelected])

  // The walked-to card comes into view, inside its list and on the board.
  useEffect(() => {
    if (!selected) return
    document.querySelector(`[data-card-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected])
}

const KEYS: Array<[string, string]> = [
  ['← ↑ → ↓', 'keysWalk'],
  ['Enter', 'keysOpen'],
  ['e', 'keysQuick'],
  ['t', 'keysRename'],
  ['l', 'keysLabels'],
  ['m', 'keysMembers'],
  ['d', 'keysDates'],
  ['␣', 'keysJoin'],
  ['s', 'keysWatch'],
  ['c', 'keysArchive'],
  ['n', 'keysAdd'],
  ['f', 'keysFilter'],
  ['q', 'keysMine'],
  ['x', 'keysClear'],
  ['/', 'keysSearch'],
  ['?', 'keysHelp'],
]

/** Trello's list of keys, opened with "?". */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t('keysTitle')} className="relative w-full max-w-md rounded-xl bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('keysTitle')}</h2>
          <button type="button" onClick={onClose} aria-label={tc('close')} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          {KEYS.map(([key, words]) => (
            <div key={key} className="contents">
              <dt>
                <kbd className="inline-flex min-w-7 justify-center rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-xs">{key}</kbd>
              </dt>
              <dd className="text-muted">{t(words as 'keysOpen')}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
