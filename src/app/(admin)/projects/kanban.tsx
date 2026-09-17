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
 * a column's grip (the six dots in its head), because that is where you can
 * see what the order does. The rest of the head is the board's to move: pulled
 * sideways it slides the board, the way the space around the cards does.
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
 * pointer events for a finger. The browser's version starts the moment the
 * mouse moves and drags the page's *text* along with it, so picking a card up
 * left half the board highlighted in blue and the card itself never visibly
 * left its place. Everything goes through pointer events now: a card lifts
 * after six pixels, in whatever direction — a column to the right is reached
 * by pulling right, and no rule about direction may stand in the way of that —
 * and what follows the cursor is a copy of the card with the board's own
 * shadow under it. A finger still picks a card up by resting on it for a
 * quarter of a second, the way the scheduling board works, so the two boards
 * are not two gestures to learn.
 *
 * The board is moved sideways by the space around the cards and the column
 * heads, by the mouse wheel anywhere but over a column's scrolling cards, by
 * its scrollbar, by two fingers, or by holding a card near the edge until it
 * comes to you.
 * Nothing is selectable on it, because a press here always means "carry",
 * never "select from here to there".
 */

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CalendarDays, GripVertical, ListChecks, MessageSquare, Paperclip, Pencil, Plus, Undo2, X } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { moveColumn } from '@/lib/boards'
import { LABEL_BAR, LABEL_PILL, PERSON_SWATCH, SUB_LABEL, URGENT_LABEL } from '@/components/swatches'
import { Menu, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { Combobox } from '@/components/combobox'
import { btn } from '@/components/ui/button'
import {
  DRAG_THRESHOLD,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  carry,
  drop as dropGhost,
  lift,
} from '@/lib/card-lift'
import { isVerticalWheel, wheelPixels } from '@/lib/wheel-axis'
import { quickAddProject, quickUpdateProject, setBoardOrder, setProjectStatus } from './actions'

export type KanbanCard = {
  id: string
  number: string
  name: string
  customer: string
  /** Town, when the project has one. */
  city: string | null
  /** Planned start and end, already formatted, and whether they are coloured. */
  dates: { text: string; tone: 'late' | 'soon' | null } | null
  /** Already formatted; null when the reader may not see money. */
  price: string | null
  /** True for the projects marked "hoch" — a red label on the card. */
  urgent: boolean
  /** A subcontractor's job. */
  sub: boolean
  status: string
  /** The trades, each in its colour (an index into the palette). */
  labels: Array<{ text: string; swatch: number }>
  /** The site checklists: how far they are ticked, and whether a problem was noted. */
  checklist: { done: number; total: number; problems: number } | null
  files: number
  comments: number
  /** Site manager first, then the team — the first few, with how many more. */
  people: Array<{ initials: string; name: string; swatch: number; manager: boolean }>
  more: number
}

const DATE_TONE = {
  late: 'bg-danger/10 text-danger',
  soon: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

/**
 * Whether the labels are opened — pills with names, which is how the board
 * opens, or bars without, the way Trello folds them. A click on any label
 * flips every one of them, and the browser remembers.
 */
const LABELS_KEY = 'baucrew-board-labels'
const LABELS_EVENT = 'baucrew:board-labels'
function subscribeLabels(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(LABELS_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(LABELS_EVENT, onChange)
  }
}
function readLabels(): boolean {
  try {
    return window.localStorage.getItem(LABELS_KEY) !== '0'
  } catch {
    return true
  }
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

/**
 * What is being held. A press does not yet say what it means — `maybe` is the
 * few pixels between pressing and knowing.
 */
type Grab =
  | { kind: 'maybe-card'; pointerId: number; card: KanbanCard; el: HTMLElement; x: number; y: number; timer: ReturnType<typeof setTimeout> | null }
  | { kind: 'card'; pointerId: number; card: KanbanCard; x: number; y: number; ghost: HTMLElement | null; el: HTMLElement }
  | { kind: 'pan'; pointerId: number; x: number; left: number }
  | { kind: 'maybe-column'; pointerId: number; status: string; el: HTMLElement; x: number; y: number; timer: ReturnType<typeof setTimeout> | null }
  | { kind: 'column'; pointerId: number; status: string; x: number; y: number; ghost: HTMLElement | null; el: HTMLElement }

export function ProjectsKanban({
  boardId,
  columns,
  customers,
  onGround,
  confirmFor,
  labels,
}: {
  /** The board the columns belong to — the order they are dragged into is saved on it. */
  boardId: string
  columns: KanbanColumn[]
  /** The customers a card added at the foot of a list can be given. */
  customers: Array<{ value: string; label: string }>
  /** True when the board stands on a coloured ground: what is written straight on it turns light. */
  onGround: boolean
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
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [board, setBoard] = useState(columns)

  /** The card's sheet over this very board: the address as it stands, plus the card. */
  const openHref = (id: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('card', id)
    return `${pathname}?${params.toString()}`
  }
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [movingColumn, setMovingColumn] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const [ask, setAsk] = useState<{ card: KanbanCard; status: string; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ card: KanbanCard; from: string; to: string } | null>(null)
  /** How many cards each column is showing, when it is showing more than the first lot. */
  const [shown, setShown] = useState<Record<string, number>>({})
  /** The list whose "Karte hinzufügen" is open, the customer typed in new, and what went wrong. */
  const [adding, setAdding] = useState<string | null>(null)
  const [newCustomer, setNewCustomer] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [addKey, setAddKey] = useState(0)
  /** The card whose name is being typed over. */
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const labelsOpen = useSyncExternalStore(subscribeLabels, readLabels, () => true)
  const toggleLabels = () => {
    try {
      window.localStorage.setItem(LABELS_KEY, labelsOpen ? '0' : '1')
    } catch {
      /* private mode: the labels flip for this visit only */
    }
    window.dispatchEvent(new Event(LABELS_EVENT))
  }

  const scroller = useRef<HTMLDivElement | null>(null)
  const grab = useRef<Grab | null>(null)
  /**
   * The order as it stands this instant.
   *
   * A column being carried past the edge is re-ordered by a timer, many times
   * a second, and letting go reads the order to save it. Read from `board`
   * that is a value captured when the handler was last drawn, which can be a
   * step or two behind what is on the screen — and what was saved was then not
   * what the person had just arranged. This is always current.
   */
  const order = useRef<string[]>(columns.map((c) => c.status))

  // The page reloads under us after a move; take the server's word for it
  // unless something is in the air.
  const busy = dragging !== null || movingColumn !== null || pending
  const [seen, setSeen] = useState(columns)
  if (seen !== columns && !busy) {
    setSeen(columns)
    setBoard(columns)
  }

  // Kept level with what is drawn, however the board came to be that way — a
  // drag, or the server answering. Written here rather than during the render
  // itself, which is not a place a ref may be touched.
  useEffect(() => {
    order.current = board.map((c) => c.status)
  }, [board])

  // On a coloured ground the undo line and the error keep their own surface; the flag is here for what is drawn bare.
  void onGround

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
    requestMove(card, status)
  }

  /** A move asked for — by a drop, or from a card's quick menu. The two that end a project ask first. */
  function requestMove(card: KanbanCard, status: string) {
    if (card.status === status) return
    if (confirmFor.includes(status)) setAsk({ card, status, label: labelOf(status) })
    else move(card, status)
  }

  const saveOrder = (order: string[]) => {
    setError(null)
    startTransition(async () => {
      const result = await setBoardOrder(boardId, order)
      if (result?.error) setError(labels.saveFailed)
      router.refresh()
    })
  }

  /** The quick menu: the card changes at once, and goes back if the server says no. */
  const quick = (card: KanbanCard, changes: { name?: string; urgent?: boolean }) => {
    const before = board
    setBoard((current) =>
      current.map((column) => ({
        ...column,
        cards: column.cards.map((c) =>
          c.id === card.id ? { ...c, name: changes.name ?? c.name, urgent: changes.urgent ?? c.urgent } : c
        ),
      }))
    )
    setError(null)
    startTransition(async () => {
      const result = await quickUpdateProject(card.id, changes)
      if (result?.error) {
        setBoard(before)
        setError(labels.saveFailed)
        return
      }
      router.refresh()
    })
  }

  const closeAdd = () => {
    setAdding(null)
    setNewCustomer(null)
    setAddError(null)
  }

  /** A card added at the foot of a list. The box stays open for the next one, the way Trello's does. */
  function submitAdd(e: React.FormEvent<HTMLFormElement>, status: string) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    if (newCustomer) data.set('customerName', newCustomer)
    setAddError(null)
    startTransition(async () => {
      const result = await quickAddProject(status, data)
      if (result.error) {
        setAddError(
          result.error === 'nameRequired'
            ? t('kanbanAddErrorName')
            : result.error === 'customerRequired'
              ? t('kanbanAddErrorCustomer')
              : labels.saveFailed
        )
        return
      }
      form.reset()
      setNewCustomer(null)
      setAddKey((k) => k + 1)
      router.refresh()
      form.querySelector<HTMLInputElement>('input[name="name"]')?.focus()
    })
  }

  // ── One pointer, four meanings ──────────────────────────────
  // A carried card or column, and a pan, are captured on the board itself, so a
  // gesture that travels out of it keeps arriving here. A mouse press on a card
  // is not captured until the card is lifted — a captured pointer sends its
  // click to the board, not to the project's name under it — and is followed
  // on the window until then (onCardPointerDown).

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
      const next = moveColumn(order.current, state.status, target)
      if (next === order.current) return
      order.current = next
      setBoard((current) => next.map((s) => current.find((c) => c.status === s)!).filter(Boolean))
    }
  }

  /** The latest trackPointer, for the wheel handler that is bound once. */
  const track = useRef<(x: number, y: number) => void>(() => {})
  useEffect(() => {
    track.current = trackPointer
  })

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
    const ghost = lift(el)
    grab.current = { kind: 'card', pointerId, card, x, y, ghost, el }
    capture(pointerId)
    setDragging(card.id)
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>, card: KanbanCard) {
    if (!scroller.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // A press on a button or a field of the card is that control's own; and a
    // press in a menu the card opened arrives here only through React's tree,
    // not through the page's.
    const pressed = e.target as HTMLElement
    if (!e.currentTarget.contains(pressed) || pressed.closest('button, input, textarea')) return
    const el = e.currentTarget
    const state: Grab = {
      kind: 'maybe-card',
      pointerId: e.pointerId,
      card,
      el,
      x: e.clientX,
      y: e.clientY,
      timer: null,
    }
    if (e.pointerType === 'mouse') {
      // The first few pixels decide; until then this is still a click on the
      // project's name, so nothing is captured that would swallow it. A
      // captured pointer sends its click to the board instead of the link
      // under it, which is how the names stopped opening their projects.
      //
      // Uncaptured, the moves stop reaching the board as soon as the mouse is
      // outside it — a card at the board's edge pulled towards the column
      // beyond it — and a button let go out there never reaches onPointerUp,
      // leaving a press behind that a later drag would lift. So until the card
      // is lifted (and captured) the press is followed on the window, and any
      // letting go ends it.
      const onMove = (ev: PointerEvent) => {
        if (grab.current !== state) return stop()
        if ((ev.buttons & 1) === 0) {
          grab.current = null
          return stop()
        }
        if (Math.hypot(ev.clientX - state.x, ev.clientY - state.y) < DRAG_THRESHOLD) return
        stop()
        beginCardDrag(card, el, state.x, state.y, state.pointerId)
      }
      const onUp = () => {
        if (grab.current === state) grab.current = null
        stop()
      }
      const stop = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
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

  function beginColumnDrag(status: string, el: HTMLElement, x: number, y: number, pointerId: number) {
    // Carried flat, not tipped: a column is as tall as the board, and a degree
    // and a half of tilt on something that tall swings its corners well outside
    // the window.
    grab.current = { kind: 'column', pointerId, status, x, y, ghost: lift(el, 0), el }
    capture(pointerId)
    setMovingColumn(status)
  }

  function onHeadPointerDown(e: React.PointerEvent<HTMLElement>, status: string) {
    if (!scroller.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // The grip is the handle, but what is carried is the whole column.
    const el = e.currentTarget.closest<HTMLElement>('[data-board-column]')
    if (!el) return
    const state: Grab = {
      kind: 'maybe-column',
      pointerId: e.pointerId,
      status,
      el,
      x: e.clientX,
      y: e.clientY,
      timer: null,
    }
    if (e.pointerType === 'mouse') {
      capture(e.pointerId)
    } else {
      const { pointerId, x, y } = state
      state.timer = setTimeout(() => {
        if (grab.current !== state) return
        beginColumnDrag(status, el, x, y, pointerId)
        if (navigator.vibrate) navigator.vibrate(15)
      }, LONG_PRESS_MS)
    }
    grab.current = state
  }

  function onBoardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // The space around the cards and a column's head, except its grip: cards
    // and grips have their own meaning, and a link is followed rather than
    // dragged. (A grip or a card has set `grab` by the time this runs — the
    // press reaches them first on its way up.)
    if (grab.current) return
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const target = e.target as HTMLElement
    // A list of options or a menu drawn at the end of the document reaches
    // this handler through React, though it is not on the board at all.
    if (!e.currentTarget.contains(target)) return
    if (target.closest('[data-board-card], [data-board-grip], a, button, input, select, textarea')) return
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
      // A mouse press is followed on the window (onCardPointerDown); only a
      // finger waiting out its long press is handled here.
      if (!state.timer) return
      const dx = e.clientX - state.x
      const dy = e.clientY - state.y
      // Still waiting out the long press: any real movement means the finger
      // is scrolling, not picking up. (A mouse lifts after six pixels in any
      // direction at all — the column a card is going to is as often to the
      // side as below.)
      if (Math.hypot(dx, dy) > LONG_PRESS_SLOP) {
        clearTimeout(state.timer)
        grab.current = null
      }
      return
    }

    if (state.kind === 'card') {
      e.preventDefault()
      carry(state.ghost, e.clientX - state.x, e.clientY - state.y)
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
      if (Math.hypot(e.clientX - state.x, e.clientY - state.y) < DRAG_THRESHOLD) return
      beginColumnDrag(state.status, state.el, state.x, state.y, state.pointerId)
      return
    }

    if (state.kind === 'column') {
      // Sideways only: a column is put beside another column, never above one,
      // and a copy that drifts up the screen while the columns shuffle under it
      // is a copy that has come loose from the thing it stands for.
      carry(state.ghost, e.clientX - state.x, 0, 0)
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
      dropGhost(state.ghost, state.el)
      const status = columnAtPoint(e.clientX, e.clientY)
      if (status) drop(status)
      else {
        setDragging(null)
        setOver(null)
      }
      return
    }
    if (state.kind === 'column') {
      // The wheel may have slid the board under a still pointer since the last
      // move: read where the column was let go, not where it was last moved.
      trackPointer(e.clientX, e.clientY)
      dropGhost(state.ghost, state.el)
      setMovingColumn(null)
      saveOrder([...order.current])
    }
  }

  // The wheel keeps to one axis at a time. A trackpad reports a few pixels of
  // sideways movement on almost every downward swipe, and a strip that can
  // scroll sideways takes them: reading down the board slid it left and right
  // under the eye. So a clearly sideways gesture — two fingers across, or shift
  // and the wheel — is left to the browser, and a mostly downward one is sorted
  // here: over a column's cards that can scroll, that column and nothing else;
  // anywhere else, the board sideways — unless the page itself can still
  // scroll (a phone, where the page grows with the board), which keeps it.
  //
  // React binds its own wheel handler passively, where preventDefault does
  // nothing, so this one is bound by hand.
  useEffect(() => {
    const box = scroller.current
    if (!box) return

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
      const dx = wheelPixels(e.deltaX, e.deltaMode, el.clientWidth)
      const dy = wheelPixels(e.deltaY, e.deltaMode, el.clientHeight)
      if (!isVerticalWheel(dx, dy)) return // a real sideways swipe
      // Downward, over a column's cards that can scroll: that column moves, and
      // only that column — reaching its end must not start sliding the board
      // under the eye. The fling keeps sending events, so the momentum of a
      // trackpad survives.
      e.preventDefault()
      const host = hostUnder(e.target, el)
      if (host) {
        host.scrollTop += dy
        return
      }
      // Anywhere else — a head, a sum, a short column, the space between and
      // below — a mouse wheel moves the board sideways: a mouse has no other
      // way to reach the columns to the right. Where the board is as tall as
      // the window the page has nowhere to go anyway. Where the page grows with
      // the board (a phone, or a large browser font that moves the tablet
      // layout's breakpoint), the page keeps the wheel. Read from the layout
      // itself, not a width, so the two can never disagree.
      const page = document.documentElement
      if (page.scrollHeight > page.clientHeight + 1) window.scrollBy(0, dy)
      else el.scrollLeft += dy
      // A card or column being carried is over a different column now.
      const held = grab.current
      if (held?.kind === 'card' || held?.kind === 'column') track.current(e.clientX, e.clientY)
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
        // `select-none` on the whole board, not only while something is being
        // dragged: the browser starts selecting on the press, before anyone
        // knows the press was a drag, and by then half the board is blue.
        // A press here always means "take hold of", never "select from here to
        // there" — the project's own page is where its text is read.
        className={`flex min-h-0 flex-1 select-none items-start gap-3 overflow-x-auto pb-2 ${
          panning || dragging || movingColumn ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {board.map((column) => {
          const limit = shown[column.status] ?? CARDS_AT_A_TIME
          const hidden = column.cards.length - limit
          return (
            <div
              key={column.status}
              data-board-column={column.status}
              // A list the way Trello draws one: a rounded grey slab as tall as
              // its cards, floating on the board's ground.
              className={`flex max-h-full w-[272px] shrink-0 flex-col overflow-hidden rounded-xl bg-[#f1f2f4] shadow-sm transition-shadow dark:bg-[#101204] ${
                over === column.status && movingColumn !== column.status ? 'ring-2 ring-accent' : ''
              }`}
            >
              {/* The head does not scroll with the cards: which status this is,
                  and how many are in it, is what the column is being read for.
                  Its grip is the column's handle — take hold of the six dots
                  and the column follows, so an office that quotes more than it
                  builds can put that column first. The rest of the head slides
                  the board, like the space around the cards: a wide head that
                  moved its column on every pull made reaching the columns to
                  the right a matter of rearranging them. */}
              <div
                data-board-head
                className="flex shrink-0 cursor-grab items-center gap-1.5 px-2 pb-1 pt-2.5 active:cursor-grabbing"
              >
                <span
                  data-board-grip
                  onPointerDown={(e) => onHeadPointerDown(e, column.status)}
                  title={t('kanbanMoveColumn')}
                  aria-hidden
                  style={{ touchAction: 'pan-x pan-y' }}
                  className="-my-1 -ml-1 flex h-6 w-6 shrink-0 cursor-move items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <GripVertical className="h-3.5 w-3.5" aria-hidden />
                </span>
                {/* The status's colour as a dot; the name is the list's own. */}
                <span className={column.badgeClass} style={{ background: 'transparent' }}>
                  <span className="block h-2 w-2 rounded-full bg-current" />
                </span>
                <h3 className="min-w-0 truncate text-sm font-semibold">{column.label}</h3>
                <span className="ml-auto text-xs tabular-nums text-muted">{column.count}</span>
              </div>
              {column.sum && (
                <p className="shrink-0 px-3 pb-1 text-[11px] tabular-nums text-muted">
                  {column.sum}
                </p>
              )}

              {/* Each column carries its own scroll. One column holding a couple
                  of hundred finished projects would otherwise make every column
                  that tall, and the whole page with them. */}
              <div className="min-h-2 flex-1 space-y-2 overflow-y-auto px-2 py-1">
                {column.cards.length === 0 && (
                  <p className="px-1 py-4 text-center text-[11px] text-muted">{labels.empty}</p>
                )}
                {column.cards.slice(0, limit).map((card) => (
                  <div
                    key={card.id}
                    onPointerDown={(e) => onCardPointerDown(e, card)}
                    // A click anywhere on the card opens it, the way a Trello
                    // card opens; a drag never ends in a click, because the
                    // pointer is captured by the board once the card is lifted.
                    onClick={(e) => {
                      const clicked = e.target as HTMLElement
                      if (!e.currentTarget.contains(clicked) || clicked.closest('a, button, input, textarea')) return
                      router.push(openHref(card.id), { scroll: false })
                    }}
                    data-board-card
                    // Both directions: a finger that starts on a card still
                    // pushes the board sideways or the column down. `pan-y`
                    // alone meant the board could only be moved by the narrow
                    // strips between the columns.
                    style={{ touchAction: 'pan-x pan-y' }}
                    className={`group relative cursor-pointer rounded-lg bg-white px-3 py-2 shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)] ring-accent/70 transition-opacity hover:ring-2 dark:bg-[#22272b] ${
                      dragging === card.id ? 'opacity-40' : ''
                    }`}
                  >
                    {/* Labels first, the way a Trello card wears them: urgent,
                        SUB and the trades, each in its own colour. */}
                    {/* The pencil of a Trello card: there when the pointer is, and
                        always where there is no pointer to hover with. */}
                    <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                      <Menu
                        side="bottom"
                        align="end"
                        label={t('cardQuickEdit')}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-muted shadow-sm transition-colors hover:text-foreground dark:bg-[#22272b]/90"
                        trigger={<Pencil className="h-3 w-3" aria-hidden />}
                      >
                        <button type="button" role="menuitem" className={menuItemClass} onClick={() => router.push(openHref(card.id), { scroll: false })}>
                          {t('cardOpen')}
                        </button>
                        <button type="button" role="menuitem" className={menuItemClass} onClick={() => setRenaming({ id: card.id, value: card.name })}>
                          {t('cardRename')}
                        </button>
                        <button type="button" role="menuitem" className={menuItemClass} onClick={() => quick(card, { urgent: !card.urgent })}>
                          {card.urgent ? t('cardUnmarkUrgent') : t('cardMarkUrgent')}
                        </button>
                        <MenuSeparator />
                        <div className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted">{t('cardMoveTo')}</div>
                        {board
                          .filter((target) => target.status !== card.status)
                          .map((target) => (
                            <button key={target.status} type="button" role="menuitem" className={menuItemClass} onClick={() => requestMove(card, target.status)}>
                              {target.label}
                            </button>
                          ))}
                      </Menu>
                    </div>
                    {/* Labels first, the way a Trello card wears them: urgent,
                        SUB and the trades, each in its own colour — named, and
                        folded to bars by a click on any of them. */}
                    {(card.urgent || card.sub || card.labels.length > 0) && (
                      <div className="mb-1.5 flex flex-wrap gap-1 pr-6">
                        {[
                          ...(card.urgent ? [{ text: t('priorityHigh'), ...URGENT_LABEL }] : []),
                          ...(card.sub ? [{ text: 'SUB', ...SUB_LABEL }] : []),
                          ...card.labels.map((label) => ({ text: label.text, bar: LABEL_BAR[label.swatch], pill: LABEL_PILL[label.swatch] })),
                        ].map((label) => (
                          <button
                            key={label.text}
                            type="button"
                            onClick={toggleLabels}
                            title={labelsOpen ? t('labelsToggle') : label.text}
                            aria-label={label.text}
                            className={
                              labelsOpen
                                ? `h-5 rounded px-2 text-[11px] font-medium leading-5 ${label.pill}`
                                : `h-2 w-10 rounded-full ${label.bar}`
                            }
                          >
                            {labelsOpen ? label.text : null}
                          </button>
                        ))}
                      </div>
                    )}
                    {renaming?.id === card.id ? (
                      <input
                        autoFocus
                        value={renaming.value}
                        maxLength={300}
                        aria-label={t('cardRename')}
                        onChange={(e) => setRenaming({ id: card.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const name = renaming.value.trim()
                            if (name && name !== card.name) quick(card, { name })
                            setRenaming(null)
                          } else if (e.key === 'Escape') {
                            setRenaming(null)
                          }
                        }}
                        onBlur={() => setRenaming(null)}
                        className="block w-full select-text rounded border border-accent bg-background px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      <Link
                        href={openHref(card.id)}
                        scroll={false}
                        draggable={false}
                        className="block pr-5 text-sm leading-snug text-foreground hover:text-accent"
                      >
                        {card.name}
                      </Link>
                    )}
                    <p className="truncate text-[11px] text-muted">
                      {card.customer}
                      {card.city && ` · ${card.city}`}
                    </p>
                    {/* What the card carries: the dates, coloured when they press;
                        the checklist, files and notes as small counts; the value. */}
                    {(card.dates || card.checklist || card.files > 0 || card.comments > 0 || card.price) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                        {card.dates && (
                          <span
                            title={card.dates.tone === 'late' ? t('cardLate') : card.dates.tone === 'soon' ? t('cardSoon') : t('cardDates')}
                            className={`inline-flex items-center gap-1 rounded-sm px-1 tabular-nums ${
                              card.dates.tone ? DATE_TONE[card.dates.tone] : ''
                            }`}
                          >
                            <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
                            {card.dates.text}
                          </span>
                        )}
                        {card.checklist && (
                          <span
                            title={t('checklistProgressTitle')}
                            className={`inline-flex items-center gap-1 rounded-sm px-1 tabular-nums ${
                              card.checklist.problems > 0
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                : card.checklist.done === card.checklist.total
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  : ''
                            }`}
                          >
                            <ListChecks className="h-3 w-3 shrink-0" aria-hidden />
                            {card.checklist.done}/{card.checklist.total}
                          </span>
                        )}
                        {card.files > 0 && (
                          <span title={t('cardFiles', { count: card.files })} className="inline-flex items-center gap-1 tabular-nums">
                            <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                            {card.files}
                          </span>
                        )}
                        {card.comments > 0 && (
                          <span title={t('cardComments', { count: card.comments })} className="inline-flex items-center gap-1 tabular-nums">
                            <MessageSquare className="h-3 w-3 shrink-0" aria-hidden />
                            {card.comments}
                          </span>
                        )}
                        {card.price && <span className="ml-auto font-medium tabular-nums text-foreground">{card.price}</span>}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] tabular-nums text-muted">{card.number}</span>
                      {card.people.length > 0 && (
                        <span className="flex -space-x-1">
                          {card.people.map((person) => (
                            <span
                              key={person.name}
                              title={person.manager ? `${t('cardManager')}: ${person.name}` : person.name}
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ${
                                person.manager ? 'ring-accent' : 'ring-white dark:ring-[#22272b]'
                              } ${PERSON_SWATCH[person.swatch]}`}
                            >
                              {person.initials}
                            </span>
                          ))}
                          {card.more > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-subtle px-1 text-[9px] font-medium text-muted ring-2 ring-white dark:ring-[#22272b]">
                              +{card.more}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
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

              {/* The foot of a list: a card is added where it belongs — a name,
                  a customer, Enter — and the box stays for the next one. */}
              <div className="shrink-0 p-2 pt-1">
                {adding === column.status ? (
                  <form onSubmit={(e) => submitAdd(e, column.status)} className="space-y-1.5">
                    <input
                      name="name"
                      autoFocus
                      required
                      maxLength={300}
                      placeholder={t('kanbanAddName')}
                      aria-label={t('kanbanAddName')}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') closeAdd()
                      }}
                      className="block w-full select-text rounded-lg bg-white px-3 py-2 text-sm shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)] focus:outline-none focus:ring-2 focus:ring-accent dark:bg-[#22272b]"
                    />
                    {newCustomer ? (
                      <p className="flex items-center justify-between gap-2 rounded-md bg-accent/10 px-2 py-1.5 text-xs text-accent">
                        <span className="truncate">{t('kanbanAddNewCustomer', { name: newCustomer })}</span>
                        <button type="button" onClick={() => setNewCustomer(null)} aria-label={tc('cancel')} className="shrink-0 rounded p-0.5 hover:bg-accent/10">
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </p>
                    ) : (
                      <Combobox
                        key={addKey}
                        name="customerId"
                        options={customers}
                        placeholder={t('kanbanAddCustomer')}
                        noResultsLabel={t('noResults')}
                        onCreateNew={(name) => setNewCustomer(name)}
                        createLabel={(name) => t('kanbanAddNewCustomer', { name })}
                      />
                    )}
                    <div className="flex items-center gap-1.5">
                      <button type="submit" disabled={pending} className={btn.primarySm}>
                        {t('kanbanAddSubmit')}
                      </button>
                      <button
                        type="button"
                        onClick={closeAdd}
                        aria-label={tc('cancel')}
                        title={tc('cancel')}
                        className="rounded-md p-1.5 text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    {addError && (
                      <p role="alert" className="text-xs text-danger">
                        {addError}
                      </p>
                    )}
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      closeAdd()
                      setAdding(column.status)
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    {t('kanbanAddCard')}
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
