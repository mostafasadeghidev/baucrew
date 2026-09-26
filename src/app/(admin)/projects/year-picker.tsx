'use client'

/**
 * The year picker of the projects page: one button, and behind it "Alle Jahre"
 * and a list of years each with a tick — one year, several (2025 and 2026
 * together), or every year. It works like the comparison years on the CRM
 * page, so the office knows it from there.
 *
 * The choice lives in the address like the search does. The running year alone
 * is where the page opens and is written as nothing; ticking a year starts
 * again at the first page, as every filter here does.
 *
 * The button has a fixed width, and its caption fills it from the left with
 * the chevron at the right edge: "2026", "2026, 2025" or "Alle Jahre" move
 * neither the switch beside it nor anything inside it.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown } from 'lucide-react'
import { Menu, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { btn } from '@/components/ui/button'
import { ALL_YEARS, projectYearsParam, toggleProjectYear, type YearSelection } from '@/lib/project-years'

/** Up to this many years are spelled out on the button; more are counted. */
const SPELLED_OUT = 2

export function ProjectYearPicker({
  options,
  selected,
  currentYear,
}: {
  /** Every year that can be ticked, newest first. */
  options: number[]
  selected: YearSelection
  currentYear: number
}) {
  const t = useTranslations('projects')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // A tick shows at once, before the round trip lands — two ticks in a row are
  // quicker than a server answer. It is kept only for the address it was made
  // on: once any navigation commits (this tick's, or a status tab clicked
  // before it landed, which replaces it), the page's own answer counts again,
  // so the button never claims years the list does not show.
  const address = searchParams.toString()
  const [tick, setTick] = useState<{ address: string; years: YearSelection } | null>(null)
  const picked = tick && tick.address === address ? tick.years : selected

  const write = (next: YearSelection) => {
    setTick({ address, years: next })
    const params = new URLSearchParams(searchParams)
    // The running year is written as nothing only while it still is the
    // running year: a page left open over New Year must not turn a click on
    // the old year into the new one.
    const running = new Date().getFullYear() === currentYear ? currentYear : Number.NaN
    const value = projectYearsParam(next, running)
    if (value) params.set('year', value)
    else params.delete('year')
    params.delete('page')
    const query = params.toString()
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  const all = picked === ALL_YEARS
  const caption = all
    ? t('yearAll')
    : picked.length > SPELLED_OUT
      ? t('yearsCount', { count: picked.length })
      : picked.join(', ')

  return (
    <Menu
      side="bottom"
      align="end"
      label={`${t('year')}: ${caption}`}
      // Its own text colour: on the board's ground the bar writes in white, and
      // a white caption on this white button was a blank button.
      className={`${btn.outline} h-10 w-36 shrink-0 text-foreground`}
      trigger={
        <>
          <span className="min-w-0 flex-1 truncate text-left tabular-nums">{caption}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </>
      }
    >
      {/* Every click keeps the list open — the next year is usually one click
          away, and the Menu closes itself on any click it hears. */}
      <div onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={all}
          onClick={() => {
            if (!all) write(ALL_YEARS)
          }}
          className={menuItemClass}
        >
          <Check aria-hidden className={`h-3.5 w-3.5 shrink-0 text-accent ${all ? '' : 'invisible'}`} />
          {t('yearAll')}
        </button>
        <MenuSeparator />
        {options.map((year) => {
          const on = !all && picked.includes(year)
          return (
            <button
              key={year}
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              onClick={() => {
                const next = toggleProjectYear(picked, year)
                // The last year ticked stays ticked, and a click that changes
                // nothing must not throw the list back to its first page.
                if (next !== picked) write(next)
              }}
              className={`${menuItemClass} tabular-nums`}
            >
              <Check aria-hidden className={`h-3.5 w-3.5 shrink-0 text-accent ${on ? '' : 'invisible'}`} />
              {year}
            </button>
          )
        })}
        {/* Why an old open job shows under this year: said where it is seen,
            for touch and keyboard too, not in a tooltip. */}
        <p className="w-56 px-2 pb-1 pt-1.5 text-[11px] leading-snug text-muted">{t('yearHint')}</p>
      </div>
    </Menu>
  )
}
