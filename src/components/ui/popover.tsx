'use client'

/**
 * A small window hanging under the button that opened it — Trello's popovers:
 * the cover, the move, the dates. Unlike a menu it stays open while its own
 * fields are used; it closes on a click beside it or on Escape, which it keeps
 * to itself so the card's sheet under it stays open.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

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
  const [box, setBox] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      const room = document.documentElement.clientWidth
      const w = Math.min(width, room - 16)
      // Under the button, its right edge under the button's when there is no room to the right.
      const left = r.left + w > room - 8 ? Math.max(8, r.right - w) : r.left
      setBox({ left, top: r.bottom + 6 })
    }
    place()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!anchor.current?.contains(target) && !panel.current?.contains(target)) onClose()
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
  }, [open, anchor, onClose, width])

  if (!open || !box || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      style={{ left: box.left, top: box.top, width }}
      className="fixed z-[80] max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-surface p-3 shadow-xl"
    >
      {children}
    </div>,
    document.body
  )
}
