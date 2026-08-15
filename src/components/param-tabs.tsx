'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

export type ParamTab = { value: string; label: string; count?: number }

/**
 * Tab bar bound to an arbitrary query param (default `tab`). The first tab is
 * the default (empty value). Other query params are preserved.
 */
export function ParamTabs({
  tabs,
  param = 'tab',
  ariaLabel,
}: {
  tabs: ParamTab[]
  param?: string
  ariaLabel?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get(param) ?? ''

  function hrefFor(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(param, value)
    else params.delete(param)
    params.delete('page')
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <nav className="flex flex-wrap gap-1 overflow-x-auto border-b border-border" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const active = tab.value === current
        return (
          <Link
            key={tab.value || '__default'}
            href={hrefFor(tab.value)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:border-border hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                  active ? 'bg-accent/10 text-accent' : 'bg-surface-hover text-muted'
                }`}
              >
                {tab.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
