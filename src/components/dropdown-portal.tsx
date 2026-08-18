'use client'

import { useCallback, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const GAP = 4
const MAX_HEIGHT = 240
const MIN_BELOW = 140

/** Subscribes to anything that can move the anchor (scrolling containers included). */
function subscribe(onChange: () => void) {
  window.addEventListener('scroll', onChange, true)
  window.addEventListener('resize', onChange)
  return () => {
    window.removeEventListener('scroll', onChange, true)
    window.removeEventListener('resize', onChange)
  }
}

/** "left,width,top|bottom,value,maxHeight" — a string so the snapshot stays stable. */
function measure(el: HTMLElement): string {
  const rect = el.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom - GAP
  const above = rect.top - GAP
  // Prefer downwards; flip up only when the list would not fit below.
  if (below >= MIN_BELOW || below >= above) {
    return [rect.left, rect.width, 'top', rect.bottom + GAP, Math.min(MAX_HEIGHT, below)].join(',')
  }
  return [rect.left, rect.width, 'bottom', window.innerHeight - rect.top + GAP, Math.min(MAX_HEIGHT, above)].join(',')
}

/**
 * Renders a dropdown list in a portal on <body> with fixed positioning, so it
 * is never clipped by a scrolling or `overflow-hidden` ancestor (cards,
 * dialogs, collapsible sections). Follows the anchor on scroll and resize.
 */
export function DropdownPortal({
  anchorRef,
  open,
  id,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  id?: string
  children: ReactNode
}) {
  const getSnapshot = useCallback(
    () => (open && anchorRef.current ? measure(anchorRef.current) : ''),
    [open, anchorRef]
  )
  const placement = useSyncExternalStore(subscribe, getSnapshot, () => '')

  if (!placement) return null
  const [left, width, side, value, maxHeight] = placement.split(',')

  return createPortal(
    <ul
      id={id}
      role="listbox"
      style={{
        position: 'fixed',
        left: Number(left),
        width: Number(width),
        [side === 'top' ? 'top' : 'bottom']: Number(value),
        maxHeight: Number(maxHeight),
      }}
      className="z-[60] overflow-auto overscroll-contain rounded-md border border-border bg-surface py-1 shadow-xl"
    >
      {children}
    </ul>,
    document.body
  )
}
