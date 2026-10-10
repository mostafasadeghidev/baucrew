'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Tabs as quiet pills, the way Framer, Webflow and Trello draw them: plain
 * text, and a soft grey pill behind the one you are on. No track, no border,
 * no line under them — they sit in the page's one-row head beside its name.
 * Used by the status tabs (project list) and the param tabs (settings,
 * reports), and by the schedule's views.
 */
export const pillTab = {
  base: 'relative flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  on: 'bg-subtle text-foreground',
  off: 'text-muted hover:bg-subtle/60 hover:text-foreground',
} as const

export function TabsList({ children, ariaLabel }: { children: ReactNode; ariaLabel?: string }) {
  return (
    <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <nav aria-label={ariaLabel} role="tablist" className="flex w-max items-center gap-0.5">
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
  scroll = true,
  onClick,
}: {
  href: string
  active: boolean
  label: string
  count?: number
  /** False for a switch far down a page: the page stays where it is instead of jumping to the top. */
  scroll?: boolean
  /** Something to remember about the choice, beside following the link. */
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      scroll={scroll}
      onClick={onClick}
      // A tab is another view of the same page, not a place of its own: it
      // replaces the entry so the browser's back gesture leaves the page
      // instead of walking back through every tab that was looked at.
      replace
      role="tab"
      aria-selected={active}
      aria-current={active ? 'page' : undefined}
      className={`${pillTab.base} ${active ? pillTab.on : pillTab.off}`}
    >
      {label}
      {count != null && <span className="text-xs tabular-nums text-muted">{count}</span>}
    </Link>
  )
}
