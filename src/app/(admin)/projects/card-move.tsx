'use client'

/**
 * The list a card stands in, over its back — the way Trello writes it there,
 * "Baustellenbeginn ▾" — and behind it Trello's "Karte verschieben": which
 * board, which list, which place in it. A list on another board is a status
 * and a rule like any list here, so a card moved "to another board" is the
 * card taking that list's status: an offer confirmed on the customer board is
 * an order in the first list of the sites board, without being carried there
 * by hand. The two moves that end a project ask first, as on the board.
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, X } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'
import { moveCard } from './actions'

export type MoveColumn = { id: string; label: string; status: string; rule: string | null; cardIds: string[] }
export type MoveBoard = { id: string; name: string; columns: MoveColumn[] }
export type CardMovePlaces = {
  /** The board the card was opened on, and the list it stands in there; null when that board has none for it. */
  boardId: string | null
  columnId: string | null
  boards: MoveBoard[]
}

/** The moves that end a project, asked about first — the same two the board asks about. */
const ASK_FOR = ['COMPLETED', 'CANCELLED']

export function CardMove({
  projectId,
  status,
  statusLabel,
  places,
}: {
  projectId: string
  status: string
  /** What the button says when the board has no list for the card: its status. */
  statusLabel: string
  places: CardMovePlaces
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ left: number; top: number } | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ask, setAsk] = useState<MoveColumn | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const currentBoard = places.boards.find((b) => b.id === places.boardId) ?? null
  const currentColumn = currentBoard?.columns.find((c) => c.id === places.columnId) ?? null
  const [boardId, setBoardId] = useState(places.boardId ?? places.boards[0]?.id ?? '')
  const board = places.boards.find((b) => b.id === boardId) ?? null
  const [columnId, setColumnId] = useState(places.columnId ?? board?.columns[0]?.id ?? '')
  const column = board?.columns.find((c) => c.id === columnId) ?? board?.columns[0] ?? null
  // The places in the chosen list, the card itself not counted: 1 is the top.
  const others = column ? column.cardIds.filter((id) => id !== projectId) : []
  const here = column ? column.cardIds.indexOf(projectId) : -1
  const [position, setPosition] = useState(here >= 0 ? here + 1 : 1)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      const width = Math.min(320, document.documentElement.clientWidth - 16)
      setBox({ left: Math.max(8, Math.min(r.left, document.documentElement.clientWidth - width - 8)), top: r.bottom + 6 })
    }
    place()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Kept to itself: under the window is the card's sheet, which closes on the same key.
      e.stopImmediatePropagation()
      setOpen(false)
      anchor.current?.focus()
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!anchor.current?.contains(target) && !panel.current?.contains(target)) setOpen(false)
    }
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  function reset() {
    setBoardId(places.boardId ?? places.boards[0]?.id ?? '')
    setColumnId(places.columnId ?? '')
    setPosition(here >= 0 ? here + 1 : 1)
    setError(null)
  }

  function go(target: MoveColumn) {
    const at = Math.min(Math.max(1, position), others.length + 1) - 1
    const prev = others[at - 1] ?? null
    const next = others[at] ?? null
    setError(null)
    startTransition(async () => {
      const result = await moveCard(projectId, target.status, { prev, next }, { from: currentColumn?.rule ?? null, to: target.rule })
      if (result?.error) {
        setError(
          result.error === 'ruleRefused' ? t('kanbanRuleRefused') : result.error === 'fixedStart' ? t('kanbanFixedStart') : tc('saveFailed')
        )
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  function submit() {
    if (!column) return
    const unchanged = column.id === places.columnId && here >= 0 && position === here + 1
    if (unchanged) {
      setOpen(false)
      return
    }
    if (column.status !== status && ASK_FOR.includes(column.status)) {
      setAsk(column)
      return
    }
    go(column)
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('cardMoveTitle')}
        onClick={() => {
          if (!open) reset()
          setOpen((o) => !o)
        }}
        // It gives way to the round buttons beside it: a long list name is cut short, the cross never pushed off the card.
        className="inline-flex min-w-0 max-w-[16rem] items-center gap-1 rounded-md bg-subtle px-2 py-1 text-xs font-semibold transition-colors hover:bg-surface-hover"
      >
        <span className="truncate">{currentColumn?.label ?? statusLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      </button>
      {open &&
        box &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={t('cardMoveTitle')}
            style={{ left: box.left, top: box.top }}
            className="fixed z-[80] w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-surface p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{t('cardMoveTitle')}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label={tc('close')} className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{t('cardMoveBoard')}</label>
            <Select
              compact
              className="mt-1 w-full"
              value={boardId}
              onChange={(e) => {
                const next = places.boards.find((b) => b.id === e.target.value)
                setBoardId(e.target.value)
                setColumnId(next?.columns[0]?.id ?? '')
                setPosition(1)
              }}
            >
              {places.boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <div className="mt-2 grid grid-cols-[1fr_5rem] gap-2">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{t('cardMoveList')}</label>
                <Select
                  compact
                  className="mt-1 w-full"
                  value={column?.id ?? ''}
                  onChange={(e) => {
                    const next = board?.columns.find((c) => c.id === e.target.value)
                    setColumnId(e.target.value)
                    const at = next ? next.cardIds.indexOf(projectId) : -1
                    setPosition(at >= 0 ? at + 1 : 1)
                  }}
                >
                  {(board?.columns ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{t('cardMovePosition')}</label>
                <Select compact className="mt-1 w-full" value={String(position)} onChange={(e) => setPosition(Number(e.target.value))}>
                  {Array.from({ length: others.length + 1 }, (_, i) => (
                    <option key={i} value={String(i + 1)}>
                      {i + 1}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {error}
              </p>
            )}
            <button type="button" disabled={pending || !column} onClick={submit} className={`${btn.primarySm} mt-3 w-full`}>
              {t('cardMoveSubmit')}
            </button>
          </div>,
          document.body
        )}
      <AlertDialog
        open={ask !== null}
        title={t('kanbanConfirmTitle')}
        description={
          ask ? (
            <>
              <span className="block font-medium">{ask.label}</span>
              <span className="block">{t('kanbanConfirmBody')}</span>
            </>
          ) : (
            ''
          )
        }
        confirmLabel={tc('confirm')}
        cancelLabel={tc('cancel')}
        pending={pending}
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          const target = ask
          setAsk(null)
          if (target) go(target)
        }}
      />
    </>
  )
}
