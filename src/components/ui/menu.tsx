'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Small dropdown menu in the spirit of shadcn/ui: a trigger you render yourself
 * and a floating panel anchored to it (portal → never clipped). Closes on
 * outside click, Escape, Tab and after an item is chosen. The arrow keys, Home
 * and End walk its items, the way a menu is walked everywhere else.
 */
export function Menu({
  trigger,
  children,
  align = 'start',
  side = 'top',
  className = '',
  label,
}: {
  /** Rendered inside the trigger button. */
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{
    left: number
    right: number
    top?: number
    bottom?: number
    width: number
  } | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const placed = box !== null

  useEffect(() => {
    if (!open) return
    const place = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // Measured against the page's width without its scrollbar: a fixed box's
      // `right` starts at that edge, and the window's width counts the
      // scrollbar the page always keeps.
      const right = document.documentElement.clientWidth - r.right
      setBox(
        side === 'top'
          ? { left: r.left, right, bottom: window.innerHeight - r.top + 6, width: r.width }
          : { left: r.left, right, top: r.bottom + 6, width: r.width }
      )
    }
    place()
    const items = () => [...(panelRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        anchorRef.current?.focus()
        return
      }
      const inside = panelRef.current?.contains(document.activeElement)
      if (!inside) return
      // The panel stands at the end of the document, so Tab out of it would
      // land at the bottom of the page with the menu still open over it.
      // Inside it Tab walks as usual — a language or theme switch in a row
      // must still be reachable — and only leaving it closes the menu.
      if (e.key === 'Tab') {
        const focusable = [
          ...(panelRef.current?.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          ) ?? []),
        ]
        const leaving = e.shiftKey
          ? document.activeElement === focusable[0]
          : document.activeElement === focusable[focusable.length - 1]
        if (!leaving) return
        e.preventDefault()
        setOpen(false)
        anchorRef.current?.focus()
        return
      }
      const list = items()
      const at = list.indexOf(document.activeElement as HTMLElement)
      // Arrows belong to a control inside a row (a select) unless focus is on an item.
      if (at < 0) return
      const next =
        e.key === 'ArrowDown'
          ? list[(at + 1) % list.length]
          : e.key === 'ArrowUp'
            ? list[(at - 1 + list.length) % list.length]
            : e.key === 'Home'
              ? list[0]
              : e.key === 'End'
                ? list[list.length - 1]
                : null
      if (!next) return
      e.preventDefault()
      next.focus()
    }
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (!anchorRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, side])

  // Opened from the keyboard, the panel has to be where the keyboard goes
  // next — it is portalled to the end of the document, so Tab alone would walk
  // the rest of the page first. It can only take focus once it is drawn, which
  // on the first opening is one render after `open`; re-placing on scroll or
  // resize must not pull focus back, hence `placed` rather than the box itself.
  useEffect(() => {
    if (!open || !placed) return
    panelRef.current
      ?.querySelector<HTMLElement>('[role^="menuitem"], button, a[href], input, select, textarea')
      ?.focus()
  }, [open, placed])

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={className}
      >
        {trigger}
      </button>
      {open &&
        typeof document !== 'undefined' &&
        box &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            // Close after the click was handled (a form inside must still
            // submit — unmounting first would cancel it).
            onClick={() => setTimeout(() => setOpen(false), 0)}
            style={{
              position: 'fixed',
              minWidth: Math.max(box.width, 200),
              ...(box.top != null ? { top: box.top } : { bottom: box.bottom }),
              ...(align === 'end' ? { right: box.right } : { left: box.left }),
            }}
            className="z-[80] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}

export const menuItemClass =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-hover focus:bg-surface-hover focus:outline-none'

export function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />
}

/** Row with a label and an interactive control; clicking it keeps the menu open. */
export function MenuRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-muted">{label}</span>
      {children}
    </div>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 py-1.5 text-xs font-medium text-muted">{children}</div>
}
