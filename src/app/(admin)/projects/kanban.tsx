'use client'

/**
 * The project list as a board, drawn the way Trello draws one: lists on a
 * ground, cards in them, and a card moves by being dragged — to another list,
 * which changes its status, or up and down its own, which changes its place.
 *
 * All nine statuses are columns, not the five a project is usually working
 * through: the office asked to see the whole way from enquiry to paid at once,
 * and a status that is only reachable through a menu is a status people forget
 * to set. Nine columns are wider than a window, so the board scrolls sideways.
 * Which columns there are is chosen in Einstellungen, and on the board itself
 * with "+ Weitere Liste"; the order they stand in is chosen here, by dragging
 * a list's head, the way a Trello list is dragged. The ground between the
 * lists slides the board.
 *
 * A card shows what a Trello card shows: its labels, its picture, its name,
 * and small marks for what hangs on it. Everything else a project is — the
 * customer, the place, the number, the value — is one click away under
 * "Kartendetails", remembered per browser, so an office that wants the fuller
 * card has it and the client sees the board they know.
 *
 * Two moves ask first. Finishing a project touches days that are already
 * planned for it, and cancelling one takes it out of every sum on the reports
 * page; the other six are ordinary steps and happen on the drop. Every move
 * can be taken back from the line that appears under the board afterwards —
 * a drag is a gesture, and gestures slip.
 *
 * The card takes its new place before the server has answered — a board that
 * waits for a round trip on every drag feels broken — and goes back if the
 * answer is an error.
 *
 * ── One gesture path, not two ──
 * Everything goes through pointer events: a card lifts after six pixels, in
 * whatever direction, and what follows the cursor is a copy of the card with
 * the board's own shadow under it, while a grey slot the card's size marks
 * where it will land and moves ahead of the pointer. A finger picks a card up
 * by resting on it for a quarter of a second, the way the scheduling board
 * works, so the two boards are not two gestures to learn.
 *
 * The board is moved sideways by the ground between the lists, by the mouse
 * wheel anywhere but over a list's scrolling cards, by its scrollbar, by two
 * fingers, or by holding a card near the edge until it comes to you. Nothing
 * is selectable on it, because a press here always means "carry", never
 * "select from here to there".
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  AlignLeft,
  CalendarDays,
  ChevronsLeftRight,
  CircleCheck,
  Clock,
  ListChecks,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { moveColumn } from '@/lib/boards'
import { COLUMN_SORTS, insertIndex, type ColumnSort } from '@/lib/board-order'
import { LABEL_BAR, LABEL_PILL, PERSON_SWATCH, SUB_LABEL, URGENT_LABEL } from '@/components/swatches'
import { Menu, MenuLabel, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { Combobox } from '@/components/combobox'
import { Select } from '@/components/ui/select'
import { btn } from '@/components/ui/button'
import { DRAG_THRESHOLD, LONG_PRESS_MS, LONG_PRESS_SLOP, carry, drop as dropGhost, lift } from '@/lib/card-lift'
import { isVerticalWheel, wheelPixels } from '@/lib/wheel-axis'
import { useCardDetails, useCollapsedColumns, useLabelsOpen } from './board-prefs'
import { addColumn, moveCard, quickAddProject, quickUpdateProject, removeColumn, renameColumn, setBoardOrder, sortColumn } from './actions'

export type KanbanCard = {
  id: string
  number: string
  name: string
  customer: string
  /** The customer's number in the office's books, when it has one. */
  customerNumber: string | null
  /** The site on one line — street, postal code, town — or what there is of it. */
  address: string | null
  /** Planned start and end, already formatted, and whether they are coloured. */
  dates: { text: string; tone: 'late' | 'soon' | null } | null
  /** The day the work is due by, already formatted, and whether it presses. */
  due: { text: string; tone: 'late' | 'soon' | null } | null
  /** The day the project was made, already formatted. */
  created: string
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
  /** Defects on the site that are still open. */
  defects: number
  /** Tasks not ticked off yet. */
  tasks: number
  /** Site manager first, then the team — the first few, with how many more. */
  people: Array<{ initials: string; name: string; swatch: number; manager: boolean }>
  more: number
  /** The picture on the front of the card: a document id, or none. */
  cover: string | null
  /** Whether the project has a description — the ≡ mark of a Trello card. */
  hasDescription: boolean
}

const DATE_TONE = {
  late: 'bg-danger/10 text-danger',
  soon: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
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

/** A list the way Trello draws one: a rounded grey slab floating on the ground. */
const LIST = 'rounded-xl bg-[#f1f2f4] shadow-sm dark:bg-[#101204]'
/** A card: white, with Trello's own shadow under it. */
const CARD = 'rounded-lg bg-white shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)] dark:bg-[#22272b]'
const HEAD_BUTTON = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10'

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

/** Where the carried card is going: which list, and before which of its cards. */
type Slot = { status: string; index: number }

/** The card taken out of wherever it is and put into `slot`. */
function placed(columns: KanbanColumn[], card: KanbanCard, slot: Slot): KanbanColumn[] {
  return columns.map((column) => {
    const rest = column.cards.filter((c) => c.id !== card.id)
    if (column.status !== slot.status) return rest.length === column.cards.length ? column : { ...column, cards: rest, count: rest.length }
    const cards = [...rest]
    cards.splice(Math.min(slot.index, cards.length), 0, { ...card, status: slot.status })
    return { ...column, cards, count: cards.length }
  })
}

/** The cards either side of `id` in its column — what the server places it between. */
function neighbours(columns: KanbanColumn[], id: string): { status: string; prev: string | null; next: string | null } | null {
  for (const column of columns) {
    const at = column.cards.findIndex((c) => c.id === id)
    if (at === -1) continue
    return { status: column.status, prev: column.cards[at - 1]?.id ?? null, next: column.cards[at + 1]?.id ?? null }
  }
  return null
}

export function ProjectsKanban({
  boardId,
  columns,
  customers,
  templates,
  onGround,
  confirmFor,
  addable,
  canEditBoard,
  settingsHref,
  labels,
}: {
  /** The board the columns belong to — the order they are dragged into is saved on it. */
  boardId: string
  columns: KanbanColumn[]
  /** The customers a card added at the foot of a list can be given. */
  customers: Array<{ value: string; label: string }>
  /** The project templates a new card can be made from; none, and the choice is not offered. */
  templates: Array<{ value: string; label: string }>
  /** True when the board stands on a coloured ground: what is written straight on it turns light. */
  onGround: boolean
  /** The statuses that ask before they are set, e.g. COMPLETED and CANCELLED. */
  confirmFor: string[]
  /** The statuses this board has no list for yet, for "+ Weitere Liste". */
  addable: Array<{ value: string; label: string }>
  /** Whether the reader may rename, add, sort and take away lists — the office. */
  canEditBoard: boolean
  /** The way to Einstellungen → Boards, for those who may go there. */
  settingsHref: string | null
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
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [board, setBoard] = useState(columns)
  const [details] = useCardDetails()
  const [collapsed, toggleCollapsed] = useCollapsedColumns(boardId)

  /** The card's sheet over this very board: the address as it stands, plus the card. */
  const openHref = (id: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('card', id)
    return `${pathname}?${params.toString()}`
  }
  const [dragging, setDragging] = useState<{ id: string; height: number } | null>(null)
  const [movingColumn, setMovingColumn] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  /** A drop that asks first: the board as it was, and the board as it would be. */
  const [ask, setAsk] = useState<{ card: KanbanCard; status: string; label: string; before: KanbanColumn[]; after: KanbanColumn[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The last move, and the board as it stood before it. */
  const [undo, setUndo] = useState<{ card: KanbanCard; to: string; before: KanbanColumn[] } | null>(null)
  /** How many cards each column is showing, when it is showing more than the first lot. */
  const [shown, setShown] = useState<Record<string, number>>({})
  /** The list whose "Karte hinzufügen" is open, the customer typed in new, and what went wrong. */
  const [adding, setAdding] = useState<string | null>(null)
  const [newCustomer, setNewCustomer] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [addTemplate, setAddTemplate] = useState('')
  const [addKey, setAddKey] = useState(0)
  /** The card whose name is being typed over, and the list whose name is. */
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [renamingList, setRenamingList] = useState<{ status: string; value: string } | null>(null)
  /** A list about to be taken off the board. */
  const [removing, setRemoving] = useState<{ status: string; label: string } | null>(null)

  const scroller = useRef<HTMLDivElement | null>(null)
  const grab = useRef<Grab | null>(null)
  /** Where the carried card is at this instant; a ref, because the pointer moves faster than a render. */
  const slot = useRef<Slot | null>(null)
  /** The board as it stood when the card was picked up — where it goes back to. */
  const lifted = useRef<KanbanColumn[] | null>(null)
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
  const busy = dragging !== null || movingColumn !== null || pending || ask !== null
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

  const labelOf = (status: string) => board.find((c) => c.status === status)?.label ?? status

  /** The board is what `after` says; the server is told where the card now stands. */
  const commit = (card: KanbanCard, after: KanbanColumn[], before: KanbanColumn[], remember = true) => {
    const place = neighbours(after, card.id)
    if (!place) return
    setBoard(after)
    setError(null)
    setUndo(remember ? { card, to: place.status, before } : null)
    startTransition(async () => {
      const result = await moveCard(card.id, place.status, { prev: place.prev, next: place.next })
      if (result?.error) {
        setBoard(before)
        setUndo(null)
        setError(labels.saveFailed)
        return
      }
      router.refresh()
    })
  }

  /** A card let go where the slot is. The two statuses that end a project ask first. */
  const settle = (card: KanbanCard) => {
    const before = lifted.current ?? board
    const after = board
    lifted.current = null
    const to = neighbours(after, card.id)?.status ?? card.status
    const same = to === card.status
    if (same && JSON.stringify(before.map((c) => c.cards.map((x) => x.id))) === JSON.stringify(after.map((c) => c.cards.map((x) => x.id)))) return
    if (!same && confirmFor.includes(to)) {
      setAsk({ card, status: to, label: labelOf(to), before, after })
      return
    }
    commit(card, after, before)
  }

  /** A move from a card's quick menu: to the top of another list. */
  function requestMove(card: KanbanCard, status: string) {
    if (card.status === status) return
    const before = board
    const after = placed(board, card, { status, index: 0 })
    if (confirmFor.includes(status)) setAsk({ card, status, label: labelOf(status), before, after })
    else commit(card, after, before)
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

  /** A list's name typed over: it changes at once, and goes back if the server says no. */
  const rename = (status: string, value: string) => {
    const before = board
    const title = value.trim()
    setBoard((current) => current.map((column) => (column.status === status && title ? { ...column, label: title } : column)))
    setError(null)
    startTransition(async () => {
      const result = await renameColumn(boardId, status, title)
      if (result?.error) {
        setBoard(before)
        setError(labels.saveFailed)
        return
      }
      router.refresh()
    })
  }

  const runOnServer = (task: () => Promise<{ error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const result = await task()
      if (result?.error) setError(result.error === 'lastColumn' ? t('kanbanRemoveListLast') : labels.saveFailed)
      router.refresh()
    })
  }

  const closeAdd = () => {
    setAdding(null)
    setNewCustomer(null)
    setAddError(null)
    setAddTemplate('')
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
  // or a list's head is not captured until the thing is lifted — a captured
  // pointer sends its click to the board, not to the name under it — and is
  // followed on the window until then.

  function columnAtPoint(x: number, y: number): string | null {
    const column = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-board-column]')
    return column?.dataset.boardColumn ?? null
  }

  /**
   * Where the carried card would land now: the list under the pointer, and
   * the place among its cards by their middles. The slot is moved there, so
   * the grey space runs ahead of the pointer the way Trello's does.
   */
  function trackCard(card: KanbanCard, x: number, y: number) {
    const status = columnAtPoint(x, y)
    if (!status) return
    const el = scroller.current?.querySelector<HTMLElement>(`[data-board-column="${status}"] [data-board-cards]`)
    const middles = el
      ? [...el.querySelectorAll<HTMLElement>('[data-board-card]:not([data-board-slot])')].map((c) => {
          const r = c.getBoundingClientRect()
          return (r.top + r.bottom) / 2
        })
      : []
    const next: Slot = { status, index: insertIndex(middles, y) }
    const current = slot.current
    if (current && current.status === next.status && current.index === next.index) return
    slot.current = next
    setBoard((columns) => placed(columns, card, next))
  }

  /** What the thing being carried is over now. Called by the pointer and by the edge scroll alike,
   *  because the board can move under a hand that is holding still. */
  function trackPointer(x: number, y: number) {
    const state = grab.current
    if (state?.kind === 'card') {
      trackCard(state.card, x, y)
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
  // edge pushes the board along under it; holding it near the top or bottom of
  // a list's cards scrolls that list.
  const edge = useRef<{ timer: ReturnType<typeof setInterval> | null; dir: number; dy: number; x: number; y: number }>({
    timer: null,
    dir: 0,
    dy: 0,
    x: 0,
    y: 0,
  })

  function stopEdgeScroll() {
    if (edge.current.timer) clearInterval(edge.current.timer)
    edge.current.timer = null
    edge.current.dir = 0
    edge.current.dy = 0
  }

  function edgeScroll(x: number, y: number) {
    const box = scroller.current
    if (!box) return
    edge.current.x = x
    edge.current.y = y
    const rect = box.getBoundingClientRect()
    const ZONE = 64
    const dir = x < rect.left + ZONE ? -1 : x > rect.right - ZONE ? 1 : 0
    // The list's own scroll, when a card is held near its top or bottom.
    let dy = 0
    if (grab.current?.kind === 'card') {
      const host = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-board-cards]')
      if (host && host.scrollHeight > host.clientHeight) {
        const r = host.getBoundingClientRect()
        dy = y < r.top + 48 ? -1 : y > r.bottom - 48 ? 1 : 0
      }
    }
    if (dir === edge.current.dir && dy === edge.current.dy) return
    stopEdgeScroll()
    if (dir === 0 && dy === 0) return
    edge.current.dir = dir
    edge.current.dy = dy
    edge.current.timer = setInterval(() => {
      const el = scroller.current
      if (!el || !grab.current) return stopEdgeScroll()
      if (dir) el.scrollLeft += dir * 14
      if (dy) {
        const host = document.elementFromPoint(edge.current.x, edge.current.y)?.closest<HTMLElement>('[data-board-cards]')
        if (host) host.scrollTop += dy * 10
      }
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
    const height = el.getBoundingClientRect().height
    grab.current = { kind: 'card', pointerId, card, x, y, ghost, el }
    lifted.current = board
    const column = board.find((c) => c.status === card.status)
    slot.current = { status: card.status, index: Math.max(0, column?.cards.findIndex((c) => c.id === card.id) ?? 0) }
    capture(pointerId)
    setDragging({ id: card.id, height })
  }

  /** The card put back where it was picked up, and nothing sent. */
  function cancelCardDrag() {
    const state = grab.current
    if (state?.kind !== 'card') return
    grab.current = null
    stopEdgeScroll()
    dropGhost(state.ghost, state.el)
    if (lifted.current) setBoard(lifted.current)
    lifted.current = null
    slot.current = null
    setDragging(null)
  }

  /**
   * A press that may become a drag. A mouse is followed on the window until
   * it has moved far enough — the first few pixels decide, and until then this
   * is still a click on whatever is under it, so nothing is captured that
   * would swallow the click. A finger says "carry this" by staying still.
   */
  function watchPress<S extends Extract<Grab, { kind: 'maybe-card' | 'maybe-column' }>>(
    e: React.PointerEvent<HTMLElement>,
    state: S,
    begin: () => void
  ) {
    if (e.pointerType === 'mouse') {
      const onMove = (ev: PointerEvent) => {
        if (grab.current !== state) return stop()
        if ((ev.buttons & 1) === 0) {
          grab.current = null
          return stop()
        }
        if (Math.hypot(ev.clientX - state.x, ev.clientY - state.y) < DRAG_THRESHOLD) return
        stop()
        begin()
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
      state.timer = setTimeout(() => {
        if (grab.current !== state) return
        begin()
        if (navigator.vibrate) navigator.vibrate(15)
      }, LONG_PRESS_MS)
    }
    grab.current = state
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
    const state: Grab = { kind: 'maybe-card', pointerId: e.pointerId, card, el, x: e.clientX, y: e.clientY, timer: null }
    watchPress(e, state, () => beginCardDrag(card, el, state.x, state.y, state.pointerId))
  }

  function beginColumnDrag(status: string, el: HTMLElement, x: number, y: number, pointerId: number) {
    // Carried flat, not tipped: a column is as tall as the board, and a degree
    // and a half of tilt on something that tall swings its corners well outside
    // the window.
    grab.current = { kind: 'column', pointerId, status, x, y, ghost: lift(el, 0), el }
    capture(pointerId)
    setMovingColumn(status)
  }

  /** The head is the list's handle, the way a Trello list is carried by its head. */
  function onHeadPointerDown(e: React.PointerEvent<HTMLElement>, status: string) {
    if (!scroller.current || !canEditBoard) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const pressed = e.target as HTMLElement
    if (!e.currentTarget.contains(pressed) || pressed.closest('button, input, a')) return
    const el = e.currentTarget.closest<HTMLElement>('[data-board-column]')
    if (!el) return
    const state: Grab = { kind: 'maybe-column', pointerId: e.pointerId, status, el, x: e.clientX, y: e.clientY, timer: null }
    watchPress(e, state, () => beginColumnDrag(status, el, state.x, state.y, state.pointerId))
  }

  function onBoardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // The ground between and below the lists: cards, heads and controls have
    // their own meaning, and a link is followed rather than dragged. (A head
    // or a card has set `grab` by the time this runs — the press reaches them
    // first on its way up.)
    if (grab.current) return
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const target = e.target as HTMLElement
    // A list of options or a menu drawn at the end of the document reaches
    // this handler through React, though it is not on the board at all.
    if (!e.currentTarget.contains(target)) return
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

    if (state.kind === 'maybe-card' || state.kind === 'maybe-column') {
      // A mouse press is followed on the window (watchPress); only a finger
      // waiting out its long press is handled here. Any real movement means
      // the finger is scrolling, not picking up.
      if (!state.timer) return
      if (Math.hypot(e.clientX - state.x, e.clientY - state.y) > LONG_PRESS_SLOP) {
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
      // The wheel or the edge may have moved the board under a still pointer.
      trackCard(state.card, e.clientX, e.clientY)
      slot.current = null
      setDragging(null)
      settle(state.card)
      return
    }
    if (state.kind === 'column') {
      trackPointer(e.clientX, e.clientY)
      dropGhost(state.ghost, state.el)
      setMovingColumn(null)
      saveOrder([...order.current])
    }
  }

  // Escape while a card is in hand puts it back where it came from.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && grab.current?.kind === 'card') cancelCardDrag()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      e.preventDefault()
      const host = hostUnder(e.target, el)
      if (host) {
        host.scrollTop += dy
        return
      }
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

  const sortLabel: Record<ColumnSort, string> = {
    name: t('kanbanSortName'),
    number: t('kanbanSortNumber'),
    start: t('kanbanSortStart'),
    created: t('kanbanSortCreated'),
  }
  /** Small marks under a card's name, the way a Trello card carries them. */
  const mark = (title: string, className = '') => `inline-flex items-center gap-1 rounded-sm px-1 tabular-nums ${className}`

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
        className={`flex min-h-0 flex-1 select-none items-start gap-3 overflow-x-auto pb-2 ${
          panning || dragging || movingColumn ? 'cursor-grabbing' : ''
        }`}
      >
        {board.map((column) => {
          const limit = shown[column.status] ?? CARDS_AT_A_TIME
          const hidden = column.cards.length - limit
          if (collapsed.includes(column.status)) {
            // Folded to a strip: its name down the side, its count, and a click to open it again.
            return (
              <button
                key={column.status}
                type="button"
                data-board-column={column.status}
                onClick={() => toggleCollapsed(column.status)}
                title={t('kanbanExpand')}
                className={`flex max-h-full w-10 shrink-0 flex-col items-center gap-2 py-2 ${LIST} hover:bg-[#e6e8ec] dark:hover:bg-[#1b1e21]`}
              >
                <span className={HEAD_BUTTON} aria-hidden>
                  <ChevronsLeftRight className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs tabular-nums text-muted">{column.cards.length}</span>
                <span className="min-h-0 truncate text-sm font-semibold [writing-mode:vertical-rl]">{column.label}</span>
              </button>
            )
          }
          return (
            <div
              key={column.status}
              data-board-column={column.status}
              className={`flex max-h-full w-[272px] shrink-0 flex-col overflow-hidden ${LIST} ${
                movingColumn === column.status ? 'opacity-40' : ''
              }`}
            >
              {/* The head does not scroll with the cards. It is the list's
                  handle: take hold of it and the list follows. Its name is
                  typed over in place; its menu holds the rest. */}
              <div
                data-board-head
                onPointerDown={(e) => onHeadPointerDown(e, column.status)}
                className={`flex shrink-0 items-center gap-1 px-2 pb-1 pt-2 ${canEditBoard ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                {details && (
                  <span className={`${column.badgeClass} ml-1`} style={{ background: 'transparent' }}>
                    <span className="block h-2 w-2 rounded-full bg-current" />
                  </span>
                )}
                {renamingList?.status === column.status ? (
                  <input
                    autoFocus
                    value={renamingList.value}
                    maxLength={40}
                    aria-label={t('kanbanRenameList')}
                    onChange={(e) => setRenamingList({ status: column.status, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (renamingList.value.trim() !== column.label) rename(column.status, renamingList.value)
                        setRenamingList(null)
                      } else if (e.key === 'Escape') setRenamingList(null)
                    }}
                    onBlur={() => {
                      if (renamingList.value.trim() && renamingList.value.trim() !== column.label) rename(column.status, renamingList.value)
                      setRenamingList(null)
                    }}
                    className="min-w-0 flex-1 select-text rounded-md border border-accent bg-background px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <h3
                    onClick={canEditBoard ? () => setRenamingList({ status: column.status, value: column.label }) : undefined}
                    title={canEditBoard ? t('kanbanRenameList') : undefined}
                    className={`min-w-0 flex-1 truncate rounded-md px-2 py-1 text-sm font-semibold ${canEditBoard ? 'cursor-text' : ''}`}
                  >
                    {column.label}
                  </h3>
                )}
                <span className="shrink-0 text-xs tabular-nums text-muted">{column.cards.length}</span>
                <Menu side="bottom" align="end" label={t('kanbanListMenu')} className={HEAD_BUTTON} trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}>
                  <MenuLabel>{t('kanbanListMenu')}</MenuLabel>
                  <button type="button" role="menuitem" className={menuItemClass} onClick={() => { closeAdd(); setAdding(column.status) }}>
                    {t('kanbanAddCard')}
                  </button>
                  <button type="button" role="menuitem" className={menuItemClass} onClick={() => toggleCollapsed(column.status)}>
                    {t('kanbanCollapse')}
                  </button>
                  {canEditBoard && (
                    <>
                      <button type="button" role="menuitem" className={menuItemClass} onClick={() => setRenamingList({ status: column.status, value: column.label })}>
                        {t('kanbanRenameList')}
                      </button>
                      <MenuSeparator />
                      <MenuLabel>{t('kanbanSortBy')}</MenuLabel>
                      {COLUMN_SORTS.map((by) => (
                        <button key={by} type="button" role="menuitem" className={menuItemClass} onClick={() => runOnServer(() => sortColumn(column.status, by))}>
                          {sortLabel[by]}
                        </button>
                      ))}
                      <MenuSeparator />
                      <button type="button" role="menuitem" className={`${menuItemClass} text-danger`} onClick={() => setRemoving({ status: column.status, label: column.label })}>
                        {t('kanbanRemoveList')}
                      </button>
                      {settingsHref && (
                        <Link href={settingsHref} role="menuitem" className={menuItemClass}>
                          {t('boardsManage')}
                        </Link>
                      )}
                    </>
                  )}
                </Menu>
              </div>
              {details && column.sum && (
                <p className="shrink-0 px-3 pb-1 text-[11px] tabular-nums text-muted">{column.sum}</p>
              )}

              {/* Each column carries its own scroll. One column holding a couple
                  of hundred finished projects would otherwise make every column
                  that tall, and the whole page with them. */}
              <div data-board-cards className="min-h-2 flex-1 space-y-2 overflow-y-auto px-2 py-1">
                {column.cards.length === 0 && !dragging && (
                  <p className="px-1 py-4 text-center text-[11px] text-muted">{labels.empty}</p>
                )}
                {column.cards.slice(0, limit).map((card) =>
                  dragging?.id === card.id ? (
                    // The card is in hand; this is the space it will drop into.
                    <div
                      key={card.id}
                      data-board-card
                      data-board-slot
                      aria-hidden
                      style={{ height: dragging.height }}
                      className="rounded-lg bg-black/10 dark:bg-white/10"
                    />
                  ) : (
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
                    className={`group relative cursor-pointer overflow-hidden ${CARD} ring-accent/70 transition-shadow hover:ring-2`}
                  >
                    {/* The picture on the front, the way a Trello card wears its cover. */}
                    {card.cover && (
                      // The project's own photo, served by the app itself; next/image has nothing to optimise here.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/${card.cover}`}
                        alt=""
                        draggable={false}
                        loading="lazy"
                        className="max-h-44 w-full bg-black/5 object-cover"
                      />
                    )}
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
                    <div className="px-3 py-2">
                    {/* Labels first, the way a Trello card wears them: urgent,
                        SUB and the trades, each in its own colour — named, and
                        folded to bars by a click on any of them. */}
                    <CardLabels card={card} urgentText={t('priorityHigh')} toggleTitle={t('labelsToggle')} />
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
                    {details && (
                      <>
                        <p className="truncate text-[11px] text-muted">
                          {card.customer}
                          {card.customerNumber && (
                            <span title={t('cardCustomerNumber')} className="tabular-nums">
                              {' · '}
                              {card.customerNumber}
                            </span>
                          )}
                        </p>
                        {card.address && (
                          <p className="flex items-center gap-1 text-[11px] text-muted" title={card.address}>
                            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">{card.address}</span>
                          </p>
                        )}
                      </>
                    )}
                    {/* What the card carries, as small marks: a description, the
                        dates coloured when they press, the checklist, what is
                        open, what is attached and said; and who is on it. */}
                    <div className="mt-1.5 flex items-end justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                        {card.hasDescription && (
                          <span title={t('cardDescription')} className={mark('')}>
                            <AlignLeft className="h-3 w-3 shrink-0" aria-hidden />
                          </span>
                        )}
                        {card.dates && (
                          <span
                            title={card.dates.tone === 'late' ? t('cardLate') : card.dates.tone === 'soon' ? t('cardSoon') : t('cardDates')}
                            className={mark('', card.dates.tone ? DATE_TONE[card.dates.tone] : '')}
                          >
                            <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
                            {card.dates.text}
                          </span>
                        )}
                        {card.due && (
                          <span
                            title={card.due.tone === 'late' ? t('cardDueLate') : card.due.tone === 'soon' ? t('cardDueSoon') : t('cardDue')}
                            className={mark('', card.due.tone ? DATE_TONE[card.due.tone] : '')}
                          >
                            <Clock className="h-3 w-3 shrink-0" aria-hidden />
                            {card.due.text}
                          </span>
                        )}
                        {card.checklist && (
                          <span
                            title={t('checklistProgressTitle')}
                            className={mark(
                              '',
                              card.checklist.problems > 0
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                : card.checklist.done === card.checklist.total
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  : ''
                            )}
                          >
                            <ListChecks className="h-3 w-3 shrink-0" aria-hidden />
                            {card.checklist.done}/{card.checklist.total}
                          </span>
                        )}
                        {card.tasks > 0 && (
                          <span title={t('cardTasks', { count: card.tasks })} className={mark('')}>
                            <CircleCheck className="h-3 w-3 shrink-0" aria-hidden />
                            {card.tasks}
                          </span>
                        )}
                        {card.defects > 0 && (
                          <span title={t('cardDefects', { count: card.defects })} className={mark('', 'bg-danger/10 text-danger')}>
                            <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
                            {card.defects}
                          </span>
                        )}
                        {card.files > 0 && (
                          <span title={t('cardFiles', { count: card.files })} className={mark('')}>
                            <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                            {card.files}
                          </span>
                        )}
                        {card.comments > 0 && (
                          <span title={t('cardComments', { count: card.comments })} className={mark('')}>
                            <MessageSquare className="h-3 w-3 shrink-0" aria-hidden />
                            {card.comments}
                          </span>
                        )}
                        {details && card.price && <span className="font-medium tabular-nums text-foreground">{card.price}</span>}
                      </div>
                      {card.people.length > 0 && (
                        <span className="flex shrink-0 -space-x-1">
                          {card.people.map((person) => (
                            <span
                              key={person.name}
                              title={person.manager ? `${t('cardManager')}: ${person.name}` : person.name}
                              className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ${
                                person.manager ? 'ring-accent' : 'ring-white dark:ring-[#22272b]'
                              } ${PERSON_SWATCH[person.swatch]}`}
                            >
                              {person.initials}
                            </span>
                          ))}
                          {card.more > 0 && (
                            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-subtle px-1 text-[9px] font-medium text-muted ring-2 ring-white dark:ring-[#22272b]">
                              +{card.more}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {details && (
                      <p className="mt-1 truncate text-[11px] tabular-nums text-muted">
                        {card.number}
                        <span title={t('cardCreated')}> · {card.created}</span>
                      </p>
                    )}
                    </div>
                  </div>
                  )
                )}
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
                    className="w-full rounded-md px-1 py-1.5 text-center text-[11px] text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
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
                      className={`block w-full select-text px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent ${CARD}`}
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
                    {templates.length > 0 && (
                      // Held here rather than by the form: the box empties itself
                      // for the next card, and five cards of one kind are five
                      // cards from one template.
                      <Select
                        name="templateId"
                        compact
                        aria-label={t('kanbanAddTemplate')}
                        value={addTemplate}
                        onChange={(e) => setAddTemplate(e.target.value)}
                        className="w-full"
                      >
                        <option value="">{t('kanbanAddNoTemplate')}</option>
                        {templates.map((template) => (
                          <option key={template.value} value={template.value}>
                            {template.label}
                          </option>
                        ))}
                      </Select>
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

        {/* Another list, for a status the board does not show yet — at the
            right end, where Trello keeps it. */}
        {canEditBoard && addable.length > 0 && (
          <div className="w-[272px] shrink-0">
            <Menu
              side="bottom"
              align="start"
              label={t('kanbanAddList')}
              className={`flex w-full items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                onGround ? 'bg-white/25 text-white hover:bg-white/35' : 'bg-subtle text-foreground hover:bg-surface-hover'
              }`}
              trigger={
                <>
                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                  {t('kanbanAddList')}
                </>
              }
            >
              <MenuLabel>{t('kanbanAddListWhich')}</MenuLabel>
              {addable.map((status) => (
                <button key={status.value} type="button" role="menuitem" className={menuItemClass} onClick={() => runOnServer(() => addColumn(boardId, status.value))}>
                  {status.label}
                </button>
              ))}
            </Menu>
          </div>
        )}
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
              const back = undo.before
              setUndo(null)
              commit(undo.card, back, board, false)
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
          if (ask) commit(ask.card, ask.after, ask.before)
          setAsk(null)
        }}
        onCancel={() => {
          if (ask) setBoard(ask.before)
          setAsk(null)
        }}
      />

      <AlertDialog
        open={removing !== null}
        title={t('kanbanRemoveList')}
        description={removing ? t('kanbanRemoveListConfirm', { name: removing.label }) : ''}
        confirmLabel={labels.confirm}
        cancelLabel={labels.cancel}
        pending={pending}
        onConfirm={() => {
          if (removing) runOnServer(() => removeColumn(boardId, removing.status))
          setRemoving(null)
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

/**
 * The labels of a card: urgent, SUB and the trades, each in its own colour —
 * named, and folded to bars by a click on any of them, which folds them on
 * every card and is remembered by the browser (see board-prefs).
 */
function CardLabels({ card, urgentText, toggleTitle }: { card: KanbanCard; urgentText: string; toggleTitle: string }) {
  const [open, toggle] = useLabelsOpen()
  if (!(card.urgent || card.sub || card.labels.length > 0)) return null
  return (
    <div className="mb-1.5 flex flex-wrap gap-1 pr-6">
      {[
        ...(card.urgent ? [{ text: urgentText, ...URGENT_LABEL }] : []),
        ...(card.sub ? [{ text: 'SUB', ...SUB_LABEL }] : []),
        ...card.labels.map((label) => ({ text: label.text, bar: LABEL_BAR[label.swatch], pill: LABEL_PILL[label.swatch] })),
      ].map((label) => (
        <button
          key={label.text}
          type="button"
          onClick={toggle}
          title={open ? toggleTitle : label.text}
          aria-label={label.text}
          className={open ? `h-5 rounded px-2 text-[11px] font-medium leading-5 ${label.pill}` : `h-2 w-10 rounded-full ${label.bar}`}
        >
          {open ? label.text : null}
        </button>
      ))}
    </div>
  )
}

