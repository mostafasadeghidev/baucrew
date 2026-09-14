'use client'

/**
 * Things that belong together light up together. Anything inside with a
 * `data-group` marks every element of the area with the same value `data-lit`
 * while the pointer or the keyboard is on one of them, and the area itself
 * `data-lighting`, so the rest can step back. A group of one lights nothing:
 * there is nothing to connect.
 *
 * One listener for the whole area, and plain attributes rather than state, so
 * a year of tiles is not drawn again on every move of the mouse.
 */

import { useRef, type ReactNode } from 'react'

export function HoverGroups({ children, className }: { children: ReactNode; className?: string }) {
  const area = useRef<HTMLDivElement>(null)
  const lit = useRef<string | null>(null)

  const light = (target: EventTarget | null) => {
    const root = area.current
    if (!root) return
    const group = target instanceof Element ? (target.closest<HTMLElement>('[data-group]')?.dataset.group ?? null) : null
    if (group === lit.current) return
    lit.current = group
    root.querySelectorAll('[data-lit]').forEach((el) => el.removeAttribute('data-lit'))
    root.removeAttribute('data-lighting')
    if (!group) return
    const peers = root.querySelectorAll(`[data-group="${CSS.escape(group)}"]`)
    if (peers.length < 2) return
    peers.forEach((el) => el.setAttribute('data-lit', ''))
    root.setAttribute('data-lighting', '')
  }

  return (
    <div
      ref={area}
      className={className}
      onPointerOver={(e) => light(e.target)}
      onPointerLeave={() => light(null)}
      onFocusCapture={(e) => light(e.target)}
      onBlurCapture={() => light(null)}
    >
      {children}
    </div>
  )
}
