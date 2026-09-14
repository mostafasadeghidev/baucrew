'use client'

/**
 * A grid that scrolls both ways, for the revenue tab's lanes and year matrix.
 *
 * Twelve months are wider than the page and a year of sites can be taller than
 * the window, so the box holds its own scroll and pins its edges the way a
 * spreadsheet does — the month heads along the top, the lane or site names down
 * the left. How tall it may get is the page's to say: the year matrix is no
 * taller than the window, so both pinned edges are on screen at once; the lanes
 * are as tall as their tiles, and the page scrolls instead. Its pinned cells are
 * layered inside it and nowhere else: they slide under each other, never over
 * the page's own bar.
 *
 * It moves like the project board: by its scrollbars, by two fingers, by shift
 * and the wheel, or by pulling the space inside it with the mouse. A swipe that
 * is mostly downward moves it down — and at its end, the page — and never
 * sideways as well.
 *
 * It opens on the running month with the month before it in view, and keeps
 * the month at its left edge when the zoom changes. The month heads mark
 * themselves with `data-month-col` and their month (0–11) in `data-month`.
 *
 * On paper the columns share the page's width instead, the pins let go, and
 * the colours print — a shade is the only thing some cells have to say.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DRAG_THRESHOLD } from '@/lib/card-lift'
import { isVerticalWheel, wheelPixels } from '@/lib/wheel-axis'

type Grab = { pointerId: number; x: number; y: number; left: number; top: number; moving: boolean }

/** The month heads, left to right. */
const monthHeads = (box: HTMLElement) => Array.from(box.querySelectorAll<HTMLElement>('[data-month-col]'))

/**
 * Which head the box opens on: the one before the running month's. When the
 * running month is not drawn — a period that leaves it out, or a month with
 * nothing in it — the first month after it stands in, counted the way the
 * months run. Another year opens at its start.
 */
function openingIndex(heads: HTMLElement[], runningMonth: number): number {
  if (runningMonth < 0 || heads.length === 0) return 0
  const months = heads.map((head) => Number(head.dataset.month))
  const at = months.indexOf(runningMonth)
  if (at >= 0) return Math.max(0, at - 1)
  const ascending = months.length < 2 || months[1] > months[0]
  const next = months.findIndex((month) => (ascending ? month > runningMonth : month < runningMonth))
  return next < 0 ? 0 : Math.max(0, next - 1)
}

export function PanBox({
  label,
  zoom,
  runningMonth,
  columns,
  printColumns,
  className = '',
  children,
}: {
  /** Names the box for a screen reader, which is told it is a region that scrolls. */
  label: string
  /** The layout's zoom: when it changes, the month at the left edge stays there. */
  zoom: string
  /** The month (0–11) running today, or −1 in another year. */
  runningMonth: number
  /** The grid's columns on screen, and on paper. */
  columns: string
  printColumns: string
  className?: string
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const grab = useRef<Grab | null>(null)
  const [panning, setPanning] = useState(false)
  // Which month stands at the left edge — counted in months, not pixels, since
  // a change of zoom changes what a pixel offset points at.
  const first = useRef<number | null>(null)
  // Where the box put itself last. A zoom that cannot reach the month clamps
  // the offset, and the scroll that follows must not be taken for the reader
  // moving: the month is kept for the next zoom that can reach it.
  const placed = useRef<number | null>(null)

  // Before the paint of every render after the first, so a change of zoom is
  // never seen at the wrong month. A full page load paints the server's HTML
  // first and moves to the running month once the page is live.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const heads = monthHeads(el)
    if (heads.length === 0) return
    if (first.current === null) first.current = openingIndex(heads, runningMonth)
    el.scrollLeft = heads[Math.min(first.current, heads.length - 1)].offsetLeft - heads[0].offsetLeft
    placed.current = el.scrollLeft
  }, [zoom, runningMonth])

  function onScroll() {
    const el = box.current
    if (!el) return
    if (placed.current !== null && Math.abs(el.scrollLeft - placed.current) <= 1) return
    placed.current = null
    const heads = monthHeads(el)
    if (heads.length < 2) return
    const step = heads[1].offsetLeft - heads[0].offsetLeft
    if (step > 0) first.current = Math.round(el.scrollLeft / step)
  }

  // A mouse pulls the box by anything in it but a link or a control. Six
  // pixels of pull start it, so a click still clicks.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if ((e.target as Element).closest('a, button, input, select, textarea, summary')) return
    const el = box.current
    if (!el || (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)) return
    grab.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      moving: false,
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = grab.current
    const el = box.current
    if (!state || !el || e.pointerId !== state.pointerId) return
    const dx = e.clientX - state.x
    const dy = e.clientY - state.y
    if (!state.moving) {
      // The button came up somewhere outside the box.
      if (e.buttons === 0) {
        grab.current = null
        return
      }
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      grab.current = { ...state, moving: true }
      el.setPointerCapture(state.pointerId)
      window.getSelection()?.removeAllRanges()
      setPanning(true)
    }
    el.scrollLeft = state.left - dx
    el.scrollTop = state.top - dy
  }

  // A press that leaves the box before it became a pull is over; a drag that
  // wanders back in later is another gesture.
  function onPointerLeave() {
    if (!grab.current?.moving) grab.current = null
  }

  function onPointerEnd() {
    const state = grab.current
    grab.current = null
    if (!state?.moving) return
    try {
      box.current?.releasePointerCapture(state.pointerId)
    } catch {
      /* already released */
    }
    setPanning(false)
  }

  // React binds its own wheel handler passively, where preventDefault does
  // nothing, so this one is bound by hand.
  useEffect(() => {
    const el = box.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      const target = box.current
      if (!target || target.scrollWidth <= target.clientWidth) return // nothing to drift sideways
      if (e.shiftKey || e.ctrlKey) return // sideways by hand, or zoom
      // Mid-fling the browser may no longer let the event be held back; moving
      // the box by hand as well would move it twice.
      if (!e.cancelable) return
      const dx = wheelPixels(e.deltaX, e.deltaMode, target.clientWidth)
      const dy = wheelPixels(e.deltaY, e.deltaMode, target.clientHeight)
      if (!isVerticalWheel(dx, dy)) return // a real sideways swipe
      // Down only: the box while it has room, the page after it — by exactly
      // what the browser would have moved, so a trackpad's fling keeps going.
      e.preventDefault()
      const before = target.scrollTop
      target.scrollTop = before + dy
      if (target.scrollTop === before) window.scrollBy(0, dy)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      ref={box}
      role="region"
      aria-label={label}
      tabIndex={0}
      style={{ '--cols': columns, '--print-cols': printColumns } as CSSProperties}
      onScroll={onScroll}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      className={`relative isolate grid overflow-auto overscroll-x-contain [grid-template-columns:var(--cols)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        panning ? 'cursor-grabbing select-none' : ''
      } ${className} print:max-h-none print:overflow-visible print:[grid-template-columns:var(--print-cols)] print:[print-color-adjust:exact] print:[&_.sticky]:static`}
    >
      {children}
    </div>
  )
}
