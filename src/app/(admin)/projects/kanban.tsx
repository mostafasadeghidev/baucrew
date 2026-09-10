'use client'

/**
 * The project list as a board: one column per status, and a card moves from
 * one to the next by being dragged there.
 *
 * All nine statuses are columns, not the five a project is usually working
 * through: the office asked to see the whole way from enquiry to paid at once,
 * and a status that is only reachable through a menu is a status people forget
 * to set. Nine columns are wider than a window, so the board scrolls sideways
 * — the alternative was folding the finished ones away, which hides exactly
 * the end of the road this view exists to show.
 *
 * Two moves ask first. Finishing a project touches days that are already
 * planned for it, and cancelling one takes it out of every sum on the reports
 * page; the other six are ordinary steps and happen on the drop.
 *
 * The card jumps to its new column before the server has answered — a board
 * that waits for a round trip on every drag feels broken — and goes back if
 * the answer is an error.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { setProjectStatus } from './actions'

export type KanbanCard = {
  id: string
  number: string
  name: string
  customer: string
  /** Town, when the project has one. */
  city: string | null
  /** The planned start, already formatted; null when none is set. */
  start: string | null
  /** Already formatted; null when the reader may not see money. */
  price: string | null
  /** True for the projects marked "hoch" — a red mark in the list. */
  urgent: boolean
  status: string
}

export type KanbanColumn = {
  status: string
  label: string
  /** How many the column holds in the database, cards may be fewer. */
  count: number
  /** The column's own sum, or null when the reader may not see money. */
  sum: string | null
  /** "12 weitere", when the column holds more than it shows; null otherwise. */
  moreLabel: string | null
  /** The colour the status wears everywhere else in the app. */
  badgeClass: string
  cards: KanbanCard[]
}

export function ProjectsKanban({
  columns,
  confirmFor,
  labels,
}: {
  columns: KanbanColumn[]
  /** The statuses that ask before they are set, e.g. COMPLETED and CANCELLED. */
  confirmFor: string[]
  /**
   * Plain words only: a server component cannot hand a client one a function,
   * so anything that needs a number in it is spelled out on the server and
   * arrives here finished.
   */
  labels: {
    confirmTitle: string
    confirmBody: string
    confirm: string
    cancel: string
    empty: string
    saveFailed: string
  }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [board, setBoard] = useState(columns)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [ask, setAsk] = useState<{ card: KanbanCard; status: string; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The page reloads under us after a move; take the server's word for it
  // unless a card is in the air.
  const [seen, setSeen] = useState(columns)
  if (seen !== columns && dragging === null && !pending) {
    setSeen(columns)
    setBoard(columns)
  }

  const move = (card: KanbanCard, status: string) => {
    if (card.status === status) return
    const before = board
    setBoard((current) =>
      current.map((column) => {
        if (column.status === card.status)
          return { ...column, count: column.count - 1, cards: column.cards.filter((c) => c.id !== card.id) }
        if (column.status === status)
          return { ...column, count: column.count + 1, cards: [{ ...card, status }, ...column.cards] }
        return column
      })
    )
    setError(null)
    startTransition(async () => {
      const result = await setProjectStatus(card.id, status)
      if (result?.error) {
        setBoard(before)
        setError(labels.saveFailed)
        return
      }
      router.refresh()
    })
  }

  const drop = (status: string, label: string) => {
    const card = board.flatMap((c) => c.cards).find((c) => c.id === dragging)
    setDragging(null)
    setOver(null)
    if (!card || card.status === status) return
    if (confirmFor.includes(status)) setAsk({ card, status, label })
    else move(card, status)
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {board.map((column) => (
          <div
            key={column.status}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => setOver(column.status)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
            }}
            onDrop={() => drop(column.status, column.label)}
            className={`flex w-64 shrink-0 flex-col rounded-xl border bg-subtle/40 transition-colors ${
              over === column.status ? 'border-accent bg-accent/5' : 'border-border'
            }`}
          >
            <div className="flex items-baseline gap-2 border-b border-border px-3 py-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${column.badgeClass}`}>
                {column.label}
              </span>
              <span className="ml-auto text-[11px] tabular-nums text-muted">{column.count}</span>
            </div>
            {column.sum && (
              <p className="border-b border-border px-3 py-1 text-[11px] tabular-nums text-muted">
                {column.sum}
              </p>
            )}

            <div className="flex-1 space-y-2 p-2">
              {column.cards.length === 0 && (
                <p className="px-1 py-4 text-center text-[11px] text-muted">{labels.empty}</p>
              )}
              {column.cards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => setDragging(card.id)}
                  onDragEnd={() => {
                    setDragging(null)
                    setOver(null)
                  }}
                  className={`rounded-lg border border-border bg-surface px-2.5 py-2 shadow-sm transition-opacity ${
                    dragging === card.id ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-baseline gap-1.5">
                    {card.urgent && <span className="text-xs font-semibold text-danger">!</span>}
                    <span className="text-[11px] tabular-nums text-muted">{card.number}</span>
                    {card.price && (
                      <span className="ml-auto text-[11px] font-medium tabular-nums">{card.price}</span>
                    )}
                  </div>
                  <Link
                    href={`/projects/${card.id}`}
                    draggable={false}
                    className="mt-0.5 block text-[13px] font-medium text-accent hover:underline"
                  >
                    {card.name}
                  </Link>
                  <p className="truncate text-[11px] text-muted">
                    {card.customer}
                    {card.city && ` · ${card.city}`}
                  </p>
                  {card.start && (
                    <p className="mt-1 text-[11px] tabular-nums text-muted">{card.start}</p>
                  )}
                </div>
              ))}
              {column.moreLabel && column.count > column.cards.length && (
                <p className="px-1 pt-1 text-center text-[11px] text-muted">{column.moreLabel}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <AlertDialog
        open={ask !== null}
        title={labels.confirmTitle}
        description={
          ask ? (
            <span className="block space-y-1">
              <span className="block font-medium text-foreground">
                {ask.card.number} — {ask.card.name}
              </span>
              <span className="block">→ {ask.label}</span>
              <span className="block">{labels.confirmBody}</span>
            </span>
          ) : (
            ''
          )
        }
        confirmLabel={labels.confirm}
        cancelLabel={labels.cancel}
        pending={pending}
        onConfirm={() => {
          if (ask) move(ask.card, ask.status)
          setAsk(null)
        }}
        onCancel={() => setAsk(null)}
      />
    </div>
  )
}
