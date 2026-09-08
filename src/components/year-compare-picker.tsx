'use client'

/**
 * Picks the years the monthly chart is compared against. One chip per chosen
 * year with an × to take it away, and a small select to add another.
 *
 * The choice lives in the URL like the year and the period do, so a comparison
 * survives a reload and can be sent to somebody as a link. An empty list is
 * written as an empty parameter on purpose: "no comparison at all" has to be
 * tellable apart from "has not chosen yet", which is the year before.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { X } from 'lucide-react'
import { Select } from './ui/select'

export function YearComparePicker({
  options,
  selected,
  param = 'compare',
  max = 4,
  addLabel,
  removeLabels,
}: {
  /** Every year that may be added, the year on screen excluded. */
  options: number[]
  /** The years chosen, newest first. */
  selected: number[]
  param?: string
  max?: number
  addLabel: string
  /**
   * The "take this year away" label per year, ready-made — a server page
   * cannot hand a client component a function to build them with.
   */
  removeLabels: Record<string, string>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const write = (years: number[]) => {
    const params = new URLSearchParams(searchParams)
    // Always explicit, empty included — see the note at the top.
    params.set(param, [...years].sort((a, b) => b - a).join(','))
    startTransition(() =>
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    )
  }

  const free = options.filter((y) => !selected.includes(y))

  return (
    <div className="flex flex-wrap items-center gap-1.5 print:hidden">
      {selected.map((year) => (
        <span
          key={year}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-subtle py-1 pl-2 pr-1 text-xs tabular-nums"
        >
          {year}
          <button
            type="button"
            aria-label={removeLabels[year]}
            onClick={() => write(selected.filter((y) => y !== year))}
            className="rounded-sm p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
      {free.length > 0 && selected.length < max && (
        <Select
          className="w-28"
          compact
          aria-label={addLabel}
          value=""
          onChange={(e) => e.target.value && write([...selected, Number(e.target.value)])}
        >
          <option value="">{addLabel}</option>
          {free.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
      )}
    </div>
  )
}
