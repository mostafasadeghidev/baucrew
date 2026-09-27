'use client'

/**
 * A long text shown the way Trello shows a long card description: the first
 * few lines, fading out, and "Mehr anzeigen" under them — "Weniger anzeigen"
 * once it is open. A text that fits is shown whole, with no button at all.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

export function ClampText({ children, more, less }: { children: ReactNode; more: string; less: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  // Measured by the browser rather than guessed from the length: a line of a
  // long address wraps differently in the sheet than on the page.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(() => setOverflows(el.scrollHeight > el.clientHeight + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div>
      <div
        ref={box}
        className={
          open
            ? ''
            : `max-h-48 overflow-hidden ${overflows ? '[mask-image:linear-gradient(to_bottom,black_65%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black_65%,transparent)]' : ''}`
        }
      >
        {children}
      </div>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 w-full rounded-md bg-subtle px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-hover"
        >
          {open ? less : more}
        </button>
      )}
    </div>
  )
}
