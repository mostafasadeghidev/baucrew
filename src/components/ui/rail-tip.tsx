'use client'

/**
 * The label of a folded sidebar item, shown beside it while the pointer rests
 * on it or the keyboard reaches it.
 *
 * It is drawn into the document rather than inside the item because the nav
 * scrolls, and anything sticking out of a scrolling box is cut off at its
 * edge. The browser's own `title` tooltip would not be cut off, but it waits
 * about a second and never appears on a touchscreen — and a rail of nine
 * look-alike icons is unusable if the names are that hard to get at.
 */

import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function RailTip({
  label,
  children,
  className = 'block',
}: {
  label: string
  children: ReactNode
  /** The wrapper needs a box of its own — `display: contents` takes no pointer. */
  className?: string
}) {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  const show = () => {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setBox({ top: rect.top + rect.height / 2, left: rect.right + 8 })
  }

  return (
    <span
      ref={ref}
      className={className}
      onPointerEnter={show}
      onPointerLeave={() => setBox(null)}
      onFocus={show}
      onBlur={() => setBox(null)}
    >
      {children}
      {box &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            role="tooltip"
            style={{ position: 'fixed', top: box.top, left: box.left, transform: 'translateY(-50%)' }}
            className="pointer-events-none z-[90] whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground shadow-md"
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  )
}
