'use client'

/**
 * What this printout shows — above the sheet, never on it. The office ticks
 * the work types the day is about, chooses whether the rest of the list is
 * printed at all, and whether the project's description goes into the notes
 * box. Every change goes into the address at once, so the sheet under it is
 * always the one that will be printed.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { sheetOptionsQuery, type SheetOptions } from '@/lib/sheet-options'

export function SheetOptionsBar({
  options,
  own,
  categories,
  labels,
}: {
  options: SheetOptions
  /** The project's own work types — the default, written as nothing. */
  own: string[]
  categories: Array<{ id: string; label: string }>
  labels: { heading: string; types: string; only: string; notes: string; reset: string }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const write = (next: SheetOptions) => {
    const params = new URLSearchParams(searchParams)
    for (const key of ['types', 'only', 'notes']) params.delete(key)
    for (const [key, value] of Object.entries(sheetOptionsQuery(next, own))) params.set(key, value)
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  const changed = Object.keys(sheetOptionsQuery(options, own)).length > 0

  return (
    <fieldset disabled={pending} className="rounded-lg border border-border bg-surface p-3 text-sm shadow-sm print:hidden">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{labels.heading}</legend>
      <p className="text-xs text-muted">{labels.types}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {categories.map((category) => (
          <label key={category.id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={options.types.includes(category.id)}
              onChange={(e) =>
                write({
                  ...options,
                  types: e.target.checked ? [...options.types, category.id] : options.types.filter((id) => id !== category.id),
                })
              }
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {category.label}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border pt-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={options.only} onChange={(e) => write({ ...options, only: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          {labels.only}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={options.notes} onChange={(e) => write({ ...options, notes: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          {labels.notes}
        </label>
        {changed && (
          <button type="button" onClick={() => write({ types: own, only: false, notes: false })} className="ml-auto text-xs text-muted hover:text-foreground hover:underline">
            {labels.reset}
          </button>
        )}
      </div>
    </fieldset>
  )
}
