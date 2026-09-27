'use client'

/**
 * The card's title, the way Trello keeps it in reach: large at the top of the
 * card's back, and once it has scrolled away a slim bar with the title and
 * "+ Hinzufügen" holds to the top of the column instead.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

export function SheetTitle({ title, compact, children }: { title: ReactNode; compact: ReactNode; children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div
        aria-hidden={!stuck}
        className={`sticky top-0 z-20 -mx-6 flex items-center gap-3 bg-surface px-6 transition-[opacity,padding] duration-150 ${
          stuck ? 'border-b border-border py-2 opacity-100 shadow-sm' : 'pointer-events-none h-0 overflow-hidden py-0 opacity-0'
        }`}
      >
        <p className="min-w-0 flex-1 truncate text-base font-semibold">{title}</p>
        {compact}
      </div>
      {children}
      <div ref={sentinel} aria-hidden className="h-px" />
    </>
  )
}
