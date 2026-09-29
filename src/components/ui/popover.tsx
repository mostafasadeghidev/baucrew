'use client'

/**
 * A small window hanging under the button that opened it — Trello's popovers:
 * the cover, the move, the dates. Unlike a menu it stays open while its own
 * fields are used; it closes on a click beside it or on Escape, which it keeps
 * to itself so the card's sheet under it stays open.
 *
 * It hangs over the button instead when there is no room under it and more
 * above — the card templates, opened at the foot of a list near the bottom of
 * the window — and moves again whenever what it shows changes its height.
 * Where neither side has room enough it scrolls, rather than running off the
 * window.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, X } from 'lucide-react'

const HEAD_BUTTON = 'flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground'

/** Trello's head of a small window: the title in the middle, a way back on the left when there is one, the cross on the right. */
export function PopoverHead({
  title,
  close,
  closeLabel,
  back = null,
  backLabel = '',
}: {
  title: string
  close: () => void
  closeLabel: string
  back?: (() => void) | null
  backLabel?: string
}) {
  return (
    <div className="mb-3 grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center">
      {back ? (
        <button type="button" onClick={back} aria-label={backLabel} title={backLabel} className={HEAD_BUTTON}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <span />
      )}
      <p className="truncate text-center text-sm font-semibold">{title}</p>
      <button type="button" onClick={close} aria-label={closeLabel} title={closeLabel} className={HEAD_BUTTON}>
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

export function Popover({
  open,
  onClose,
  anchor,
  label,
  width = 304,
  children,
}: {
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLElement | null>
  label: string
  width?: number
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  /** Puts the window where it fits; set while it is open, called by whatever moves or resizes it. */
  const place = useRef<() => void>(() => {})

  useEffect(() => {
    if (!open) return
    place.current = () => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      const room = document.documentElement.clientWidth
      const w = Math.min(width, room - 16)
      // Under the button, its right edge under the button's when there is no room to the right.
      const left = r.left + w > room - 8 ? Math.max(8, r.right - w) : r.left
      // What it would need whole, not what it is given: the side is chosen by that.
      const height = panel.current?.scrollHeight ?? 0
      const below = window.innerHeight - r.bottom - 14
      const above = r.top - 14
      const up = height > below && above > below
      const top = up ? Math.max(8, r.top - 6 - Math.min(height, above)) : r.bottom + 6
      const maxHeight = Math.max(120, up ? above : below)
      setBox((b) => (b && b.left === left && b.top === top && b.maxHeight === maxHeight ? b : { left, top, maxHeight }))
    }
    const moved = () => place.current()
    moved()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // A field's list of options open in the window closes first, by the
      // field's own hand; the window, and what was typed into it, stays.
      if (document.querySelector('[role="listbox"]')) return
      e.stopImmediatePropagation()
      onClose()
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      // A field's list of options is drawn at the end of the page, but it is the popover's own.
      if (target instanceof Element && target.closest('[role="listbox"]')) return
      if (!anchor.current?.contains(target) && !panel.current?.contains(target)) onClose()
    }
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', moved)
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', moved, true)
      window.removeEventListener('resize', moved)
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, anchor, onClose, width])

  // Once it is drawn its height is known: placed again before it is painted,
  // and again each time its contents grow or shrink.
  const shown = open && box !== null
  useLayoutEffect(() => {
    if (!shown || !panel.current) return
    place.current()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => place.current())
    observer.observe(panel.current)
    return () => observer.disconnect()
  }, [shown])

  if (!open || !box || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      style={{ left: box.left, top: box.top, width, maxHeight: box.maxHeight }}
      className="fixed z-[80] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface p-3 shadow-xl"
    >
      {children}
    </div>,
    document.body
  )
}
