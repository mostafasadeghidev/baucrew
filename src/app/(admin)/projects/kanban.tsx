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
 *
 * A mouse drags with the browser's own drag and drop; a finger cannot, because
 * that never fires on a touch screen. So a touch or a pen picks a card up by
 * resting on it for a quarter of a second, carries a copy of it under the
 * finger, and drops it into whatever column is under the finger when it lifts
 * — the same way the scheduling board is dragged, so the two boards are not
 * two different gestures to learn.
 */

import { useEffect, useRef, useState, useTransition } from 'react'
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

  // ── Touch drag (Pointer Events) ─────────────────────────────
  // Native drag and drop does not fire on a touch screen. A long press picks
  // the card up, a copy of it follows the finger, the column under the finger
  // lights, and letting go drops it there.
  const touch = useRef<{
    id: string
    timer: ReturnType<typeof setTimeout> | null
    active: boolean
    startX: number
    startY: number
    ghost: HTMLElement | null
  } | null>(null)

  function columnAtPoint(x: number, y: number): string | null {
    const column = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-board-column]')
    return column?.dataset.boardColumn ?? null
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>, id: string) {
    if (e.pointerType === 'mouse') return
    const card = e.currentTarget
    touch.current = {
      id,
      timer: setTimeout(() => {
        const state = touch.current
        if (!state || state.id !== id) return
        state.active = true
        const ghost = card.cloneNode(true) as HTMLElement
        const rect = card.getBoundingClientRect()
        ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;pointer-events:none;opacity:.85;z-index:60;transform:rotate(1.5deg);`
        document.body.appendChild(ghost)
        state.ghost = ghost
        setDragging(id)
        try {
          card.setPointerCapture(e.pointerId)
        } catch {
          /* the browser may refuse; the drag still works, it just leaves the card */
        }
        if (navigator.vibrate) navigator.vibrate(15)
      }, 250),
      active: false,
      startX: e.clientX,
      startY: e.clientY,
      ghost: null,
    }
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = touch.current
    if (!state) return
    if (!state.active) {
      // Moved before the press was long enough → the finger is scrolling.
      if (Math.hypot(e.clientX - state.startX, e.clientY - state.startY) > 10) {
        if (state.timer) clearTimeout(state.timer)
        touch.current = null
      }
      return
    }
    e.preventDefault()
    if (state.ghost) {
      state.ghost.style.transform = `translate(${e.clientX - state.startX}px, ${e.clientY - state.startY}px) rotate(1.5deg)`
    }
    setOver(columnAtPoint(e.clientX, e.clientY))
  }

  function onCardPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const state = touch.current
    touch.current = null
    if (!state) return
    if (state.timer) clearTimeout(state.timer)
    if (!state.active) return
    state.ghost?.remove()
    const status = columnAtPoint(e.clientX, e.clientY)
    const column = board.find((c) => c.status === status)
    if (column) drop(column.status, column.label)
    else {
      setDragging(null)
      setOver(null)
    }
  }

  // ── Moving the board sideways ───────────────────────────────
  // Nine columns are wider than any window, so getting to the far end has to
  // be easy with whatever is at hand. A trackpad and a touch screen already
  // push the strip sideways on their own, once nothing in the way claims the
  // gesture. A mouse has neither: so the board's own background is a handle —
  // press anywhere that is not a card and drag — and the wheel pushes it
  // sideways while there is still board to see, handing the page back its
  // scroll at either end rather than trapping the reader inside the board.
  const scroller = useRef<HTMLDivElement | null>(null)
  const pan = useRef<{ x: number; left: number; pointerId: number } | null>(null)
  const [panning, setPanning] = useState(false)

  function onBoardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const target = e.target as HTMLElement
    // A card is dragged to move a project; a link is followed. Only the space
    // around them moves the board.
    if (target.closest('[data-board-card], a, button, input, select, textarea')) return
    const box = scroller.current
    if (!box || box.scrollWidth <= box.clientWidth) return
    pan.current = { x: e.clientX, left: box.scrollLeft, pointerId: e.pointerId }
    setPanning(true)
    try {
      box.setPointerCapture(e.pointerId)
    } catch {
      /* the browser may refuse; the drag still works while the cursor is over the board */
    }
  }

  function onBoardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = pan.current
    const box = scroller.current
    if (!state || !box) return
    box.scrollLeft = state.left - (e.clientX - state.x)
  }

  function onBoardPointerEnd() {
    const state = pan.current
    const box = scroller.current
    if (state && box) {
      try {
        box.releasePointerCapture(state.pointerId)
      } catch {
        /* already released */
      }
    }
    pan.current = null
    setPanning(false)
  }

  // The wheel keeps to one axis at a time. A trackpad reports a few pixels of
  // sideways movement on almost every downward swipe, and a strip that can
  // scroll sideways takes them: reading down the board slid it left and right
  // under the eye. So a gesture that is mostly downward moves the page and
  // nothing else, and only a clearly sideways one — two fingers across, or
  // shift and the wheel — moves the board.
  //
  // React binds its own wheel handler passively, where preventDefault does
  // nothing, so this one is bound by hand.
  useEffect(() => {
    const box = scroller.current
    if (!box) return

    /** Firefox counts in lines and pages; everything else in pixels. */
    function toPixels(delta: number, mode: number, page: number) {
      if (mode === 1) return delta * 16
      if (mode === 2) return delta * page
      return delta
    }

    function onWheel(e: WheelEvent) {
      const el = scroller.current
      if (!el) return
      if (el.scrollWidth <= el.clientWidth) return // nothing to drift
      if (e.shiftKey || e.ctrlKey) return // sideways by hand, or zoom
      const dx = toPixels(e.deltaX, e.deltaMode, el.clientWidth)
      const dy = toPixels(e.deltaY, e.deltaMode, el.clientHeight)
      if (dy === 0 || Math.abs(dx) > Math.abs(dy)) return // a real sideways swipe
      // Downward: hold the board still and move the page by exactly what the
      // browser would have moved it. The fling keeps sending events, so the
      // momentum of a trackpad survives.
      e.preventDefault()
      window.scrollBy(0, dy)
    }

    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div
        ref={scroller}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerEnd}
        onPointerCancel={onBoardPointerEnd}
        className={`flex gap-3 overflow-x-auto pb-2 ${
          panning ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
      >
        {board.map((column) => (
          <div
            key={column.status}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => setOver(column.status)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
            }}
            onDrop={() => drop(column.status, column.label)}
            data-board-column={column.status}
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
                  onPointerDown={(e) => onCardPointerDown(e, card.id)}
                  onPointerMove={onCardPointerMove}
                  onPointerUp={onCardPointerEnd}
                  onPointerCancel={onCardPointerEnd}
                  data-board-card
                  // Both directions: a finger that starts on a card still
                  // pushes the board sideways or the page down. `pan-y` alone
                  // meant the board could only be moved by the narrow strips
                  // between the columns. The long press is unaffected — it
                  // asks for a quarter second of stillness, and a pan that
                  // starts cancels it.
                  style={{ touchAction: 'pan-x pan-y' }}
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
