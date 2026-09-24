'use client'

/**
 * What this printout shows — above the sheet, never on it. The office ticks
 * the work types the day is about, what the site set-up is geared to, and
 * whether the project's description goes into the notes box. Every change
 * goes into the address at once, so the sheet under it is always the one that
 * will be printed.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { sheetOptionsQuery, type SheetDefaults, type SheetOptions } from '@/lib/sheet-options'

type Choice = { id: string; label: string }

/** Every key the bar writes — `only` is an old one, cleared when met. */
const PARAMS = ['types', 'client', 'building', 'notes', 'only']

const box = 'h-4 w-4 accent-[var(--accent)]'

export function SheetOptionsBar({
  options,
  own,
  categories,
  clientTypes,
  buildingTypes,
  labels,
}: {
  options: SheetOptions
  /** The project's own values — the default, written as nothing. */
  own: SheetDefaults
  categories: Choice[]
  clientTypes: Choice[]
  buildingTypes: Choice[]
  labels: { heading: string; types: string; site: string; clientType: string; buildingType: string; notes: string; reset: string }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const write = (next: SheetOptions) => {
    const params = new URLSearchParams(searchParams)
    for (const key of PARAMS) params.delete(key)
    for (const [key, value] of Object.entries(sheetOptionsQuery(next, own))) params.set(key, value)
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  const changed = Object.keys(sheetOptionsQuery(options, own)).length > 0

  // One of the list or none, drawn as the sheet draws it: ticking one unticks
  // the other, ticking it again clears it.
  const oneOf = (choices: Choice[], value: string | null, set: (value: string | null) => void) =>
    choices.map((choice) => (
      <label key={choice.id} className="flex items-center gap-1.5">
        <input type="checkbox" checked={value === choice.id} onChange={(e) => set(e.target.checked ? choice.id : null)} className={box} />
        {choice.label}
      </label>
    ))

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
              className={box}
            />
            {category.label}
          </label>
        ))}
      </div>
      <p className="mt-3 border-t border-border pt-2 text-xs text-muted">{labels.site}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-xs font-medium text-muted">{labels.clientType}:</span>
        {oneOf(clientTypes, options.clientType, (value) => write({ ...options, clientType: value }))}
        <span className="text-xs font-medium text-muted sm:ml-2">{labels.buildingType}:</span>
        {oneOf(buildingTypes, options.buildingType, (value) => write({ ...options, buildingType: value }))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border pt-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={options.notes} onChange={(e) => write({ ...options, notes: e.target.checked })} className={box} />
          {labels.notes}
        </label>
        {changed && (
          <button type="button" onClick={() => write({ ...own, notes: false })} className="ml-auto text-xs text-muted hover:text-foreground hover:underline">
            {labels.reset}
          </button>
        )}
      </div>
    </fieldset>
  )
}
