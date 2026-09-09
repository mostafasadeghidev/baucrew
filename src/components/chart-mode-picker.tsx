'use client'

/**
 * Picks how the monthly chart is drawn. A button carrying the shape it is in
 * now, and behind it the shapes it can take, each with the picture of itself
 * beside its name — the icon says in one glance what the word describes.
 *
 * The choice lives in the URL like the year and the period do, so it survives
 * a reload and can be sent to somebody as a link. Bars are the default and
 * carry no parameter at all.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { ChartArea, ChartColumn, ChartLine, ChartSpline, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Menu, menuItemClass } from './ui/menu'
import { btn } from './ui/button'

export type ChartModeOption = { value: string; label: string }

/** Keyed by the URL value; the empty one is the default shape. */
const ICONS: Record<string, LucideIcon> = {
  '': ChartColumn,
  line: ChartSpline,
  linear: ChartLine,
  area: ChartArea,
}

export function ChartModePicker({
  options,
  value,
  param = 'chart',
  label,
}: {
  options: ChartModeOption[]
  /** The value in the URL now; '' is the default shape. */
  value: string
  param?: string
  /** What the button is called for a screen reader, e.g. "Darstellung". */
  label: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const current = options.find((o) => o.value === value) ?? options[0]
  const Current = ICONS[current.value] ?? ChartColumn

  const write = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next) params.set(param, next)
    else params.delete(param)
    startTransition(() =>
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, {
        scroll: false,
      })
    )
  }

  return (
    <Menu
      side="bottom"
      align="end"
      label={label}
      className={`${btn.outlineSm} gap-1.5 text-xs print:hidden`}
      trigger={
        <>
          <Current className="h-3.5 w-3.5 text-muted" aria-hidden />
          {current.label}
          <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
        </>
      }
    >
      {options.map((option) => {
        const Icon = ICONS[option.value] ?? ChartColumn
        const on = option.value === current.value
        return (
          <button
            key={option.value || 'default'}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            onClick={() => write(option.value)}
            className={`${menuItemClass} ${on ? 'bg-surface-hover font-medium' : ''}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-accent' : 'text-muted'}`} aria-hidden />
            {option.label}
          </button>
        )
      })}
    </Menu>
  )
}
