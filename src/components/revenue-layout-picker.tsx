'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  REVENUE_DENSITIES,
  REVENUE_LAYOUTS,
  REVENUE_LAYOUT_COOKIE,
  REVENUE_LAYOUT_COOKIE_MAX_AGE,
  revenueDensity,
  revenueLayoutCookieValue,
  withDensity,
  type RevenueLayout,
  type RevenueLayoutChoice,
} from '@/lib/revenue-layout'

// The same quiet pills as the tabs in the page's head: plain text, a soft
// grey pill behind the choice in force — one look for "how is this drawn".
const track = 'flex shrink-0 items-center gap-0.5 text-sm font-medium'
const segment = 'flex h-8 items-center whitespace-nowrap rounded-md'
const current = `${segment} bg-subtle text-foreground`
const other = `${segment} text-muted transition-colors hover:bg-subtle/60 hover:text-foreground`

/** Kept for the next visit, when the page opens with nothing in its address to say otherwise. */
function remember(choice: RevenueLayoutChoice) {
  document.cookie = `${REVENUE_LAYOUT_COOKIE}=${revenueLayoutCookieValue(choice)}; path=/; max-age=${REVENUE_LAYOUT_COOKIE_MAX_AGE}; samesite=lax`
}

/**
 * The revenue tab's months: grid or lanes, and each one's zoom.
 * A choice writes the address — so the view can be linked — and the cookie the
 * page falls back on when the address says nothing.
 */
export function RevenueLayoutPicker({
  choice,
  labels,
}: {
  choice: RevenueLayoutChoice
  labels: {
    layout: string
    layouts: Record<RevenueLayout, string>
    /** What the zoom counts in each layout: cards to a row, months on screen. */
    zoom: Record<RevenueLayout, string>
  }
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function hrefFor(next: RevenueLayoutChoice) {
    const params = new URLSearchParams(searchParams)
    params.set('layout', next.layout)
    params.set('per', revenueDensity(next))
    return `${pathname}?${params.toString()}`
  }

  function option(next: RevenueLayoutChoice, label: string, selected: boolean, pad: string) {
    return selected ? (
      <span key={label} aria-current="true" className={`${current} ${pad}`}>
        {label}
      </span>
    ) : (
      // Another way of drawing the same months, not a place of its own: it
      // replaces the history entry like the tabs do, and leaves the page where
      // it is scrolled to.
      <Link
        key={label}
        href={hrefFor(next)}
        replace
        scroll={false}
        onClick={() => remember(next)}
        className={`${other} ${pad}`}
      >
        {label}
      </Link>
    )
  }

  const densities: readonly string[] = REVENUE_DENSITIES[choice.layout]

  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <div role="group" aria-label={labels.layout} className={track}>
        {REVENUE_LAYOUTS.map((layout) =>
          option({ ...choice, layout }, labels.layouts[layout], choice.layout === layout, 'px-3')
        )}
      </div>
      <div role="group" aria-label={labels.zoom[choice.layout]} className="flex items-center gap-2">
        <span aria-hidden className="text-xs text-muted">
          {labels.zoom[choice.layout]}
        </span>
        <div className={track}>
          {densities.map((value) =>
            option(
              withDensity(choice, value),
              value,
              revenueDensity(choice) === value,
              'min-w-9 px-2 text-center tabular-nums'
            )
          )}
        </div>
      </div>
    </div>
  )
}
