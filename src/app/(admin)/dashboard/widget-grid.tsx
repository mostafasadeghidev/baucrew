'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import {
  DRAG_THRESHOLD,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  carry,
  drop as dropGhost,
  lift,
  zoneAtPoint,
} from '@/lib/card-lift'
import { saveDashboardOrder } from './actions'

export type GridItem = {
  id: string
  width: 'full' | 'half'
  /** Rendered on the server — the card itself, with its edit bar in edit mode. */
  node: ReactNode
}

/**
 * The dashboard grid. Outside the edit mode it is plain markup; inside it a
 * card is picked up and set down on another, and the two change places.
 *
 * It used to use the browser's own drag and drop, which meant two things: on a
 * touch screen it did nothing at all — the ↑ ↓ buttons on each card were the
 * whole story there — and with a mouse it dragged the page's text along rather
 * than the card, so the card never visibly left the grid. It is the same
 * gesture as the project board and the planning boards now: six pixels with a
 * mouse, a quarter second's rest with a finger, and what follows the pointer
 * is the card, out of the page on its own shadow.
 */
export function WidgetGrid({ items, editing }: { items: GridItem[]; editing: boolean }) {
  const [order, setOrder] = useState(() => items.map((i) => i.id))
  const [, startTransition] = useTransition()
  const changed = useRef(false)
  /** The order as it stands this instant — what is saved on release. */
  const current = useRef(order)

  useEffect(() => {
    current.current = order
  }, [order])

  const grab = useRef<{
    id: string
    timer: ReturnType<typeof setTimeout> | null
    active: boolean
    startX: number
    startY: number
    ghost: HTMLElement | null
    el: HTMLElement
  } | null>(null)

  const byId = new Map(items.map((i) => [i.id, i]))
  const sorted = order.map((id) => byId.get(id)).filter((i): i is GridItem => i !== undefined)

  function moveOnto(overId: string) {
    const from = grab.current?.id
    if (!from || from === overId) return
    setOrder((now) => {
      const next = [...now]
      const fromIndex = next.indexOf(from)
      const toIndex = next.indexOf(overId)
      if (fromIndex === -1 || toIndex === -1) return now
      next.splice(toIndex, 0, ...next.splice(fromIndex, 1))
      changed.current = true
      current.current = next
      return next
    })
  }

  function pickUp(state: NonNullable<typeof grab.current>, pointerId: number) {
    state.active = true
    state.ghost = lift(state.el)
    changed.current = false
    try {
      state.el.setPointerCapture(pointerId)
    } catch {
      /* the browser may refuse; the drag still works over the card */
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, id: string) {
    if (!editing) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget
    const state = {
      id,
      timer: null as ReturnType<typeof setTimeout> | null,
      active: false,
      startX: e.clientX,
      startY: e.clientY,
      ghost: null as HTMLElement | null,
      el,
    }
    if (e.pointerType !== 'mouse') {
      const pointerId = e.pointerId
      state.timer = setTimeout(() => {
        if (grab.current !== state) return
        pickUp(state, pointerId)
        if (navigator.vibrate) navigator.vibrate(15)
      }, LONG_PRESS_MS)
    } else {
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    grab.current = state
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = grab.current
    if (!state) return
    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY
    if (!state.active) {
      if (state.timer) {
        // A finger, still waiting out the long press: real movement means the
        // page is being scrolled, not a card picked up.
        if (Math.hypot(dx, dy) > LONG_PRESS_SLOP) {
          clearTimeout(state.timer)
          grab.current = null
        }
        return
      }
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      pickUp(state, e.pointerId)
    }
    e.preventDefault()
    carry(state.ghost, dx, dy)
    const over = zoneAtPoint(e.clientX, e.clientY, '[data-grid-card]', 'gridCard')
    if (over) moveOnto(over)
  }

  function onPointerEnd() {
    const state = grab.current
    grab.current = null
    if (!state) return
    if (state.timer) clearTimeout(state.timer)
    if (!state.active) return
    dropGhost(state.ghost, state.el)
    if (!changed.current) return
    changed.current = false
    const saved = [...current.current]
    startTransition(() => {
      void saveDashboardOrder(saved)
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sorted.map((item) => (
        <div
          key={item.id}
          data-grid-card={item.id}
          onPointerDown={(e) => onPointerDown(e, item.id)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          // While the cards are being arranged, a press means "take hold of":
          // both directions stay available to a finger, since the long press is
          // what picks a card up.
          style={editing ? { touchAction: 'pan-x pan-y' } : undefined}
          className={`grid ${item.width === 'full' ? 'lg:col-span-2' : ''} ${
            editing ? 'cursor-grab select-none active:cursor-grabbing' : ''
          }`}
        >
          {item.node}
        </div>
      ))}
    </div>
  )
}
