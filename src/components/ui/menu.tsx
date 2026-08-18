'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Small dropdown menu in the spirit of shadcn/ui: a trigger you render yourself
 * and a floating panel anchored to it (portal → never clipped). Closes on
 * outside click, Escape and after an item is chosen.
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
  const [box, setBox] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setBox(
        side === 'top'
          ? { left: r.left, bottom: window.innerHeight - r.top + 6, width: r.width }
          : { left: r.left, top: r.bottom + 6, width: r.width }
      )
    }
    place()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
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
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              left: box.left,
              minWidth: Math.max(box.width, 200),
              ...(box.top != null ? { top: box.top } : { bottom: box.bottom }),
              ...(align === 'end' ? { left: undefined, right: window.innerWidth - box.left - box.width } : {}),
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
