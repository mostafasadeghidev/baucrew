'use client'

/**
 * Picks the years the monthly chart is compared against: one button, and
 * behind it a list of years each with a tick. Nothing is written beside the
 * button — the chart's own legend already says which years are in it, and a
 * second list of the same years next to the heading only says it twice.
 *
 * The choice lives in the URL like the year and the period do, so a comparison
 * survives a reload and can be sent to somebody as a link. An empty list is
 * written as an empty parameter on purpose: "no comparison at all" has to be
 * tellable apart from "has not chosen yet", which is the year before.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Menu, menuItemClass } from './ui/menu'
import { btn } from './ui/button'

export function YearComparePicker({
  options,
  selected,
  param = 'compare',
  max = 4,
  label,
  maxHint,
  noneLabel,
  dense = false,
}: {
  /** Every year that may be chosen, the year on screen excluded. */
  options: number[]
  /** The years chosen. */
  selected: number[]
  param?: string
  max?: number
  /** The button's own words, e.g. "Vergleichsjahre". */
  label: string
  /** Shown under the list once the cap is reached. */
  maxHint: string
  /** What the dense button says when no year is ticked, e.g. "keine". */
  noneLabel?: string
  /**
   * Smaller, for a card that stands the picker beside another one: two
   * controls of the same weight compete, and this one is the second question.
   */
  dense?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // What the page last said, and what has been ticked since. Two ticks in a
  // row are quicker than a round trip, and reading the answer out of the props
  // both times would write the second tick over the first.
  const given = selected.join(',')
  const [seen, setSeen] = useState(given)
  const [picked, setPicked] = useState(selected)
  if (seen !== given) {
    setSeen(given)
    setPicked(selected)
  }

  const write = (years: number[]) => {
    setPicked(years)
    const params = new URLSearchParams(searchParams)
    // Always explicit, empty included — see the note at the top.
    params.set(param, [...years].sort((a, b) => b - a).join(','))
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  const full = picked.length >= max

  return (
    <Menu
      side="bottom"
      align="end"
      // How many are ticked belongs in the button's name: the badge that says
      // so is text a screen reader never reaches past the label.
      label={picked.length > 0 ? `${label}: ${picked.length}` : label}
      className={`${dense ? `${btn.outlineXs} w-28 text-[11px]` : `${btn.outlineSm} text-xs`} gap-1.5 print:hidden`}
      trigger={
        <>
          {/* Standing next to the year it is measured against, this button
              says years too — "2026 vs. 2025" reads; "2026 vs. Vergleichs-
              jahre 1" does not, and it is twice as wide as its neighbour. */}
          {dense ? (
            <span className="truncate tabular-nums">
              {picked.length > 0
                ? [...picked].sort((a, b) => b - a).join(', ')
                : (noneLabel ?? label)}
            </span>
          ) : (
            <>
              {label}
              {picked.length > 0 && (
                <span className="rounded-full bg-accent/10 px-1.5 text-xs tabular-nums text-accent">
                  {picked.length}
                </span>
              )}
            </>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        </>
      }
    >
      {options.map((year) => {
        const on = picked.includes(year)
        const blocked = !on && full
        return (
          // Ticking a year keeps the list open — the next one is usually one
          // click away, and the Menu closes itself on any click it hears.
          <div key={year} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              aria-disabled={blocked}
              onClick={() => {
                if (blocked) return
                write(on ? picked.filter((y) => y !== year) : [...picked, year])
              }}
              className={`${menuItemClass} tabular-nums ${blocked ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <Check
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 text-accent ${on ? '' : 'invisible'}`}
              />
              {year}
            </button>
          </div>
        )
      })}
      {full && (
        <div onClick={(e) => e.stopPropagation()} className="px-2 pb-1 pt-1.5 text-[11px] text-muted">
          {maxHint}
        </div>
      )}
    </Menu>
  )
}
