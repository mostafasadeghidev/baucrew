'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Segmented tab bar in the spirit of shadcn/ui: a subtle track with the active
 * tab as a raised pill. Used by the status tabs (project list) and the param
 * tabs (settings, reports, warehouse).
 */
export function TabsList({ children, ariaLabel }: { children: ReactNode; ariaLabel?: string }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <nav
        aria-label={ariaLabel}
        role="tablist"
        className="inline-flex w-max items-center gap-1 rounded-lg bg-subtle p-1 text-muted"
      >
        {children}
      </nav>
    </div>
  )
}

export function TabLink({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count?: number
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-surface text-foreground shadow-sm'
          : 'text-muted hover:text-foreground'
      }`}
    >
      {label}
      {count != null && (
        <span
          className={`rounded-full px-1.5 text-xs tabular-nums ${
            active ? 'bg-accent/10 text-accent' : 'bg-surface/70 text-muted'
          }`}
        >
          {count}
        </span>
      )}
    </Link>
  )
}
