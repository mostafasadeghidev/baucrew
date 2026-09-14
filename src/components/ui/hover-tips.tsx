'use client'

/**
 * Quick tooltips for many small things at once: anything inside with a
 * `data-tip` shows that text as soon as the pointer or the keyboard reaches it
 * — its lines one under the other, the first one set apart.
 *
 * One listener for the whole area instead of one component per tile, since a
 * year of sites is a few hundred of them. The tip is drawn into the document,
 * not inside the area, because the area may scroll and anything sticking out
 * of a scrolling box is cut off at its edge. The browser's own `title` waits
 * about a second, which is too slow for reading one tile after the other.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Tip = { text: string; x: number; top: number; bottom: number }

/** Half of the tip's widest, so it never runs off either side of the window. */
const HALF_WIDTH = 136

export function HoverTips({ children, className }: { children: ReactNode; className?: string }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const current = useRef<Element | null>(null)

  const show = (target: EventTarget | null) => {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null
    if (el === current.current) return
    current.current = el
    if (!el?.dataset.tip) {
      setTip(null)
      return
    }
    const rect = el.getBoundingClientRect()
    setTip({ text: el.dataset.tip, x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom })
  }
  const hide = () => {
    current.current = null
    setTip(null)
  }

  // Whatever scrolls — the box or the page — leaves the tip behind; it goes.
  useEffect(() => {
    if (!tip) return
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [tip])

  const [name, ...rest] = tip ? tip.text.split('\n') : []
  // Above the thing, unless that would leave the window; then below it.
  const above = tip ? tip.top > 72 : true

  return (
    <div
      className={className}
      onPointerOver={(e) => show(e.target)}
      onPointerLeave={hide}
      onFocusCapture={(e) => show(e.target)}
      onBlurCapture={hide}
    >
      {children}
      {tip &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: Math.min(Math.max(tip.x, HALF_WIDTH + 8), window.innerWidth - HALF_WIDTH - 8),
              top: above ? tip.top - 6 : tip.bottom + 6,
              transform: `translate(-50%, ${above ? '-100%' : '0'})`,
            }}
            className="pointer-events-none z-[90] max-w-[17rem] rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground shadow-md"
          >
            <span className="block font-medium">{name}</span>
            {rest.map((line) => (
              <span key={line} className="block tabular-nums text-muted">
                {line}
              </span>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
