'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

export type StatusTab = { value: string; label: string; count: number }

/** Tab bar bound to the `status` query param; preserves other filters, resets page. */
export function StatusTabs({ tabs, allLabel, allCount }: { tabs: StatusTab[]; allLabel: string; allCount: number }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('status') ?? ''

  function hrefFor(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) params.set('status', value)
    else params.delete('status')
    params.delete('page')
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const items: StatusTab[] = [{ value: '', label: allLabel, count: allCount }, ...tabs]

  return (
    <nav className="flex flex-wrap gap-1 overflow-x-auto border-b border-border" aria-label="Status">
      {items.map((tab) => {
        const active = tab.value === current
        return (
          <Link
            key={tab.value || 'all'}
            href={hrefFor(tab.value)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:border-border hover:text-foreground'
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                active ? 'bg-accent/10 text-accent' : 'bg-surface-hover text-muted'
              }`}
            >
              {tab.count}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
