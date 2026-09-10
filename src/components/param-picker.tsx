'use client'

/**
 * A one-of-many picker that writes its answer into the URL — the same button,
 * menu and height as the multi-select next to it, so two controls in one card
 * header line up instead of nearly lining up.
 *
 * A native select would have done the job, but not beside a menu button: it
 * carries its own padding and comes out a few pixels shorter, and two controls
 * that are almost the same height read as a mistake rather than a pair.
 *
 * The choice lives in the URL like the year and the period do, so it survives
 * a reload and can be sent to somebody as a link. The option carrying the
 * empty value is the default and writes no parameter at all.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Menu, menuItemClass } from './ui/menu'
import { btn } from './ui/button'

export type ParamOption = { value: string; label: string }

export function ParamPicker({
  options,
  value,
  param,
  label,
  dense = false,
}: {
  options: ParamOption[]
  /** The value in the URL now; '' is the default. */
  value: string
  param: string
  /** What the button is called for a screen reader, e.g. "Jahr". */
  label: string
  /** Smaller, to match a picker it stands beside. */
  dense?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const current = options.find((o) => o.value === value) ?? options[0]

  const write = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next) params.set(param, next)
    else params.delete(param)
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  return (
    <Menu
      side="bottom"
      align="start"
      // What is chosen belongs in the button's name, or a screen reader hears
      // "Jahr" whichever year is on screen.
      label={`${label}: ${current?.label ?? ''}`}
      className={`${dense ? btn.outlineXs : btn.outlineSm} gap-1.5 print:hidden ${
        dense ? 'text-[11px]' : 'text-xs'
      }`}
      trigger={
        <>
          {current?.label}
          <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
        </>
      }
    >
      {options.map((option) => {
        const on = option.value === current?.value
        return (
          <button
            key={option.value || 'default'}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            onClick={() => write(option.value)}
            className={`${menuItemClass} tabular-nums ${on ? 'font-medium' : ''}`}
          >
            <Check
              aria-hidden
              className={`h-3.5 w-3.5 shrink-0 text-accent ${on ? '' : 'invisible'}`}
            />
            {option.label}
          </button>
        )
      })}
    </Menu>
  )
}
