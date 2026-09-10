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
 * the end of the road this view exists to show. Which columns there are is
 * chosen in Einstellungen; the order they stand in is chosen here, by dragging
 * a column's head, because that is where you can see what the order does.
 *
 * Two moves ask first. Finishing a project touches days that are already
 * planned for it, and cancelling one takes it out of every sum on the reports
 * page; the other six are ordinary steps and happen on the drop. Every move
 * can be taken back from the line that appears under the board afterwards —
 * a drag is a gesture, and gestures slip.
 *
 * The card jumps to its new column before the server has answered — a board
 * that waits for a round trip on every drag feels broken — and goes back if
 * the answer is an error.
 *
 * ── One gesture path, not two ──
 * This used to drag with the browser's own drag and drop for a mouse and with
 * pointer events for a finger. The browser's version picks a card up the
 * instant the mouse moves, which meant that pulling the board sideways — the
 * obvious way to reach the far columns — filed a project under another status
 * instead, without saying which. So everything goes through pointer events
 * now, and the first few pixels decide what the gesture meant: sideways moves
 * the board, anything else carries the card (see `dragIntent`). A finger still
 * picks a card up by resting on it for a quarter of a second, the way the
 * scheduling board works, so the two boards are not two gestures to learn.
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { GripVertical, Undo2, X } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { moveColumn } from '@/lib/board-columns'
import { dragIntent } from '@/lib/drag-intent'
import { setBoardOrder, setProjectStatus } from './actions'

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
  /** How many the column holds. */
  count: number
  /** The column's own sum, or null when the reader may not see money. */
  sum: string | null
  /** The colour the status wears everywhere else in the app. */
  badgeClass: string
  cards: KanbanCard[]
}

/** How many cards a column shows before it says how many more it has. */
const CARDS_AT_A_TIME = 50

/** A finger has to rest this long on a card before it picks it up. */
const LONG_PRESS_MS = 250

/**
 * What is being held. A press does not yet say what it means — `maybe` is the
 * few pixels between pressing and knowing.
 */
type Grab =
  | { kind: 'maybe-card'; pointerId: number; card: KanbanCard; el: HTMLElement; x: number; y: number; left: number; timer: ReturnType<typeof setTimeout> | null }
  | { kind: 'card'; pointerId: number; card: KanbanCard; x: number; y: number; ghost: HTMLElement | null }
  | { kind: 'pan'; pointerId: number; x: number; left: number }
  | { kind: 'maybe-column'; pointerId: number; status: string; x: number; y: number; timer: ReturnType<typeof setTimeout> | null }
  | { kind: 'column'; pointerId: number; status: string }

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
   * arrives here finished. The two that do need a number — how many cards a
   * column is still hiding, and what a move can be taken back to — are looked
   * up here instead, where the number is known.
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
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [board, setBoard] = useState(columns)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [movingColumn, setMovingColumn] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const [ask, setAsk] = useState<{ card: KanbanCard; status: string; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ card: KanbanCard; from: string; to: string } | null>(null)
  /** How many cards each column is showing, when it is showing more than the first lot. */
  const [shown, setShown] = useState<Record<string, number>>({})

  const scroller = useRef<HTMLDivElement | null>(null)
  const grab = useRef<Grab | null>(null)

  // The page reloads under us after a move; take the server's word for it
  // unless something is in the air.
  const busy = dragging !== null || movingColumn !== null || pending
  const [seen, setSeen] = useState(columns)
  if (seen !== columns && !busy) {
    setSeen(columns)
    setBoard(columns)
  }

  const labelOf = (status: string) => board.find((c) => c.status === status)?.label ?? status

  const move = (card: KanbanCard, status: string, remember = true) => {
    if (card.status === status) return
    const before = board
    const from = card.status
    setBoard((current) =>
      current.map((column) => {
        if (column.status === from)
          return { ...column, count: column.count - 1, cards: column.cards.filter((c) => c.id !== card.id) }
        if (column.status === status)
          return { ...column, count: column.count + 1, cards: [{ ...card, status }, ...column.cards] }
        return column
      })
    )
    setError(null)
    setUndo(remember ? { card, from, to: status } : null)
    startTransition(async () => {
      const result = await setProjectStatus(card.id, status)
      if (result?.error) {
        setBoard(before)
        setUndo(null)
        setError(labels.saveFailed)
        return
      }
      router.refresh()
    })
  }

  const drop = (status: string) => {
    const card = board.flatMap((c) => c.cards).find((c) => c.id === dragging)
    setDragging(null)
    setOver(null)
    if (!card || card.status === status) return
    if (confirmFor.includes(status)) setAsk({ card, status, label: labelOf(status) })
    else move(card, status)
  }

  const saveOrder = (order: string[]) => {
    setError(null)
    startTransition(async () => {
      const result = await setBoardOrder(order)
      if (result?.error) setError(labels.saveFailed)
      router.refresh()
    })
  }

  // ── One pointer, four meanings ──────────────────────────────
  // Everything is captured on the board itself, so a gesture that starts on a
  // card and travels out of it keeps arriving here.

  function columnAtPoint(x: number, y: number): string | null {
    const column = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-board-column]')
    return column?.dataset.boardColumn ?? null
  }

  /** What the thing being carried is over now — a card's target, or where a
   *  column has got to. Called by the pointer and by the edge scroll alike,
   *  because the board can move under a hand that is holding still. */
  function trackPointer(x: number, y: number) {
    const state = grab.current
    if (state?.kind === 'card') {
      setOver(columnAtPoint(x, y))
      return
    }
    if (state?.kind === 'column') {
      const target = columnAtPoint(x, y)
      if (!target || target === state.status) return
      setBoard((current) => {
        const order = moveColumn(
          current.map((c) => c.status),
          state.status,
          target
        )
        return order.map((s) => current.find((c) => c.status === s)!).filter(Boolean)
      })
    }
  }

  // Nine columns are wider than the window, so what is being carried has to be
  // able to reach a column that is not on screen yet. Holding it near either
  // edge pushes the board along under it, the way a file dragged to the edge
  // of a list scrolls the list.
  const edge = useRef<{ timer: ReturnType<typeof setInterval> | null; dir: number; x: number; y: number }>({
    timer: null,
    dir: 0,
    x: 0,
    y: 0,
  })

  function stopEdgeScroll() {
    if (edge.current.timer) clearInterval(edge.current.timer)
    edge.current.timer = null
    edge.current.dir = 0
  }

  function edgeScroll(x: number, y: number) {
    const box = scroller.current
    if (!box) return
    edge.current.x = x
    edge.current.y = y
    const rect = box.getBoundingClientRect()
    const ZONE = 64
    const dir = x < rect.left + ZONE ? -1 : x > rect.right - ZONE ? 1 : 0
    if (dir === edge.current.dir) return
    stopEdgeScroll()
    if (dir === 0) return
    edge.current.dir = dir
    edge.current.timer = setInterval(() => {
      const el = scroller.current
      if (!el || !grab.current) return stopEdgeScroll()
      el.scrollLeft += dir * 14
      trackPointer(edge.current.x, edge.current.y)
    }, 16)
  }

  useEffect(() => stopEdgeScroll, [])

  function capture(pointerId: number) {
    try {
      scroller.current?.setPointerCapture(pointerId)
    } catch {
      /* the browser may refuse; the gesture still works over the board */
    }
  }

  function beginCardDrag(card: KanbanCard, el: HTMLElement, x: number, y: number, pointerId: number) {
    const ghost = el.cloneNode(true) as HTMLElement
    const rect = el.getBoundingClientRect()
    ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;pointer-events:none;opacity:.85;z-index:60;transform:rotate(1.5deg);`
    document.body.appendChild(ghost)
    grab.current = { kind: 'card', pointerId, card, x, y, ghost }
    capture(pointerId)
    setDragging(card.id)
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>, card: KanbanCard) {
    const box = scroller.current
    if (!box) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget
    const state: Grab = {
      kind: 'maybe-card',
      pointerId: e.pointerId,
      card,
      el,
      x: e.clientX,
      y: e.clientY,
      left: box.scrollLeft,
      timer: null,
    }
    if (e.pointerType === 'mouse') {
      // The first few pixels decide; until then this is still a click on the
      // project's name, so nothing is captured that would swallow it.
      capture(e.pointerId)
    } else {
      // A finger has no second button and no hover: it says "carry this" by
      // staying still. Anything else is the board being scrolled.
      const { pointerId, x, y } = state
      state.timer = setTimeout(() => {
        if (grab.current !== state) return
        beginCardDrag(card, el, x, y, pointerId)
        if (navigator.vibrate) navigator.vibrate(15)
      }, LONG_PRESS_MS)
    }
    grab.current = state
  }

  function onHeadPointerDown(e: React.PointerEvent<HTMLDivElement>, status: string) {
    if (!scroller.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const state: Grab = {
      kind: 'maybe-column',
      pointerId: e.pointerId,
      status,
      x: e.clientX,
      y: e.clientY,
      timer: null,
    }
    if (e.pointerType === 'mouse') {
      capture(e.pointerId)
    } else {
      const { pointerId } = state
      state.timer = setTimeout(() => {
        if (grab.current !== state) return
        grab.current = { kind: 'column', pointerId, status }
        capture(pointerId)
        setMovingColumn(status)
        if (navigator.vibrate) navigator.vibrate(15)
      }, LONG_PRESS_MS)
    }
    grab.current = state
  }

  function onBoardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only the space around the cards and the heads: those have their own
    // meaning, and a link is followed rather than dragged.
    if (grab.current) return
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('[data-board-card], [data-board-head], a, button, input, select, textarea')) return
    const box = scroller.current
    if (!box || box.scrollWidth <= box.clientWidth) return
    grab.current = { kind: 'pan', pointerId: e.pointerId, x: e.clientX, left: box.scrollLeft }
    capture(e.pointerId)
    setPanning(true)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = grab.current
    const box = scroller.current
    if (!state || !box) return

    if (state.kind === 'maybe-card') {
      const dx = e.clientX - state.x
      const dy = e.clientY - state.y
      if (state.timer) {
        // A finger, still waiting out the long press: any real movement means
        // it is scrolling, not picking up.
        if (Math.hypot(dx, dy) > 10) {
          clearTimeout(state.timer)
          grab.current = null
        }
        return
      }
      const intent = dragIntent(dx, dy)
      if (intent === 'none') return
      if (intent === 'board') {
        grab.current = { kind: 'pan', pointerId: state.pointerId, x: state.x, left: state.left }
        setPanning(true)
        box.scrollLeft = state.left - dx
        return
      }
      beginCardDrag(state.card, state.el, state.x, state.y, state.pointerId)
      return
    }

    if (state.kind === 'card') {
      e.preventDefault()
      if (state.ghost) {
        state.ghost.style.transform = `translate(${e.clientX - state.x}px, ${e.clientY - state.y}px) rotate(1.5deg)`
      }
      trackPointer(e.clientX, e.clientY)
      edgeScroll(e.clientX, e.clientY)
      return
    }

    if (state.kind === 'pan') {
      box.scrollLeft = state.left - (e.clientX - state.x)
      return
    }

    if (state.kind === 'maybe-column') {
      if (state.timer) return // a finger, still waiting
      if (Math.hypot(e.clientX - state.x, e.clientY - state.y) < 6) return
      grab.current = { kind: 'column', pointerId: state.pointerId, status: state.status }
      setMovingColumn(state.status)
      return
    }

    if (state.kind === 'column') {
      trackPointer(e.clientX, e.clientY)
      edgeScroll(e.clientX, e.clientY)
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const state = grab.current
    grab.current = null
    stopEdgeScroll()
    if (!state) return
    if ('timer' in state && state.timer) clearTimeout(state.timer)
    try {
      scroller.current?.releasePointerCapture(state.pointerId)
    } catch {
      /* already released */
    }

    if (state.kind === 'pan') {
      setPanning(false)
      return
    }
    if (state.kind === 'card') {
      state.ghost?.remove()
      const status = columnAtPoint(e.clientX, e.clientY)
      if (status) drop(status)
      else {
        setDragging(null)
        setOver(null)
      }
      return
    }
    if (state.kind === 'column') {
      setMovingColumn(null)
      saveOrder(board.map((c) => c.status))
    }
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

    /** The scrolling box the pointer is in — a column's cards, if any. */
    function hostUnder(target: EventTarget | null, board: HTMLElement) {
      let el = target instanceof Element ? target : null
      while (el && el !== board) {
        if (
          el instanceof HTMLElement &&
          el.scrollHeight > el.clientHeight &&
          /(auto|scroll)/.test(getComputedStyle(el).overflowY)
        ) {
          return el
        }
        el = el.parentElement
      }
      return null
    }

    function onWheel(e: WheelEvent) {
      const el = scroller.current
      if (!el) return
      if (el.scrollWidth <= el.clientWidth) return // nothing to drift
      if (e.shiftKey || e.ctrlKey) return // sideways by hand, or zoom
      const dx = toPixels(e.deltaX, e.deltaMode, el.clientWidth)
      const dy = toPixels(e.deltaY, e.deltaMode, el.clientHeight)
      if (dy === 0 || Math.abs(dx) > Math.abs(dy)) return // a real sideways swipe
      // Downward: hold the board still and move by exactly what the browser
      // would have moved — the column under the cursor if it still has room,
      // the page otherwise. The fling keeps sending events, so the momentum of
      // a trackpad survives.
      e.preventDefault()
      const host = hostUnder(e.target, el)
      if (host) {
        const before = host.scrollTop
        host.scrollTop = before + dy
        if (host.scrollTop !== before) return
      }
      window.scrollBy(0, dy)
    }

    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="flex h-full flex-col gap-2">
      {error && (
        <p className="shrink-0 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div
        ref={scroller}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2 ${
          panning ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
      >
        {board.map((column) => {
          const limit = shown[column.status] ?? CARDS_AT_A_TIME
          const hidden = column.cards.length - limit
          return (
            <div
              key={column.status}
              data-board-column={column.status}
              className={`flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border bg-subtle/40 transition-colors ${
                movingColumn === column.status
                  ? 'border-accent opacity-70 ring-2 ring-accent'
                  : over === column.status
                    ? 'border-accent bg-accent/5'
                    : 'border-border'
              }`}
            >
              {/* The head does not scroll with the cards: which status this is,
                  and how many are in it, is what the column is being read for.
                  It is also the column's handle — take hold of it and the
                  column follows, so an office that quotes more than it builds
                  can put that column first. */}
              <div
                data-board-head
                onPointerDown={(e) => onHeadPointerDown(e, column.status)}
                title={t('kanbanMoveColumn')}
                style={{ touchAction: 'pan-x pan-y' }}
                className="flex shrink-0 cursor-grab items-center gap-1.5 border-b border-border px-2 py-2 active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${column.badgeClass}`}>
                  {column.label}
                </span>
                <span className="ml-auto text-[11px] tabular-nums text-muted">{column.count}</span>
              </div>
              {column.sum && (
                <p className="shrink-0 border-b border-border px-3 py-1 text-[11px] tabular-nums text-muted">
                  {column.sum}
                </p>
              )}

              {/* Each column carries its own scroll. One column holding a couple
                  of hundred finished projects would otherwise make every column
                  that tall, and the whole page with them. */}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {column.cards.length === 0 && (
                  <p className="px-1 py-4 text-center text-[11px] text-muted">{labels.empty}</p>
                )}
                {column.cards.slice(0, limit).map((card) => (
                  <div
                    key={card.id}
                    onPointerDown={(e) => onCardPointerDown(e, card)}
                    data-board-card
                    // Both directions: a finger that starts on a card still
                    // pushes the board sideways or the column down. `pan-y`
                    // alone meant the board could only be moved by the narrow
                    // strips between the columns.
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
                {hidden > 0 && (
                  // The rest are a click away rather than a page away: a column
                  // that says "103 more" and does nothing about it is a dead end.
                  <button
                    type="button"
                    onClick={() =>
                      setShown((current) => ({
                        ...current,
                        [column.status]: limit + CARDS_AT_A_TIME,
                      }))
                    }
                    className="w-full rounded-md px-1 py-1.5 text-center text-[11px] text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  >
                    {t('kanbanMore', { count: hidden })}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {undo && (
        // A drag is a gesture, and gestures slip. Rather than ask before every
        // move — six of the nine are ordinary steps — the board says what it
        // just did and offers to put it back.
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <span className="tabular-nums text-muted">{undo.card.number}</span>
          <span className="truncate font-medium">{undo.card.name}</span>
          <span className="text-muted">→ {labelOf(undo.to)}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              move({ ...undo.card, status: undo.to }, undo.from, false)
              setUndo(null)
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            {tc('undo')}
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            aria-label={tc('dismiss')}
            title={tc('dismiss')}
            className="rounded-md p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

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
