'use client'

/**
 * The jobs behind a month of the revenue chart, shown right under it.
 *
 * A figure in a chart asks "made of what?", and the answer used to be another
 * tab with another year and another month set on it — three things changed to
 * read one list, and the comparison the reader was in was gone. Now a click on
 * a month opens the lists in place: the chart stays, the years chosen stay, the
 * next month is one click away and a second click on the same spot puts the
 * lists away again.
 *
 * Every year in the chart gets a column — the chart compares years, so the
 * answer to "made of what?" is a comparison too: March of this year beside
 * March of the years it is held against, each with its total, how far the year
 * on screen stands above or below it, and its jobs, the largest first. The
 * columns stand in the chart's order and wear the chart's colours. Where a
 * single year's bar was clicked, that year's column is the one marked.
 *
 * The chart and the panel stand in different cards of a page the server
 * renders, so which month is open lives in a small context around both. The
 * lines of every year in the chart come with the page: opening a month is
 * instant, there is nothing to wait for.
 */

import Link from 'next/link'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowUpRight, X } from 'lucide-react'
import { percentChange } from '@/lib/reports-calc'

export type MonthSpot = { year: number; month: number }

type DetailState = { open: MonthSpot | null; toggle: (spot: MonthSpot) => void; close: () => void }

const DetailContext = createContext<DetailState | null>(null)

export function MonthDetailProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<MonthSpot | null>(null)
  const value = useMemo<DetailState>(
    () => ({
      open,
      toggle: (spot) => setOpen((now) => (now && now.year === spot.year && now.month === spot.month ? null : spot)),
      close: () => setOpen(null),
    }),
    [open]
  )
  return <DetailContext.Provider value={value}>{children}</DetailContext.Provider>
}

/** Null where no provider stands around the chart — the chart then has nothing to open. */
export function useMonthDetail(): DetailState | null {
  return useContext(DetailContext)
}

export type MonthDetailLine = {
  key: string
  number: string
  name: string
  customer: string
  /** Already formatted; null when the reader may not see money. */
  amount: string | null
  /** The project's page; null for a line of the planning sheet that no project is tied to. */
  href: string | null
}

export type MonthDetailData = {
  /** Largest first. */
  own: MonthDetailLine[]
  sub: MonthDetailLine[]
  /** Already formatted. */
  ownTotal: string
  subTotal: string
  total: string
  /** The month's total as a number — what the years are held against each other by. */
  totalValue: number
  /** The same month on the Planumsatz tab. */
  href: string
}

/** The chart's colours, as a dot: the year on screen in the accent, the compared ones by their tone. */
const TONE_DOT = ['bg-neutral-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500']
const TONE_EDGE = ['border-t-neutral-500', 'border-t-sky-500', 'border-t-amber-500', 'border-t-rose-500', 'border-t-teal-500']

/** How many jobs a column shows before it asks; the rest is a click away, so the columns stay one height. */
const SHOWN = 6

/** Literal, so Tailwind finds them: one column, two, or three to a row. */
const COLUMNS = ['', 'md:grid-cols-2', 'md:grid-cols-2 xl:grid-cols-3']

export function MonthDetailPanel({
  data,
  years,
  baseYear,
  tones,
  monthNames,
}: {
  /** Twelve months for every year in the chart. */
  data: Record<number, MonthDetailData[]>
  /** The years in the chart, in the chart's order — newest first. */
  years: number[]
  /** The year on screen: the one the others are compared with. */
  baseYear: number
  /** Which of the chart's colours a compared year wears. */
  tones: Record<number, number>
  monthNames: string[]
}) {
  const t = useTranslations('reports')
  const tc = useTranslations('common')
  const detail = useMonthDetail()
  const panel = useRef<HTMLElement>(null)
  const open = detail?.open ?? null
  const spotKey = open ? `${open.year}-${open.month}` : ''
  const monthKey = open ? open.month : -1
  // Which columns show every job; starts over with another month.
  const [expanded, setExpanded] = useState<{ month: number; years: number[] }>({ month: -1, years: [] })
  const shownAll = expanded.month === monthKey ? expanded.years : []

  // Brought into view when it opens below the fold — the click should be seen to have done something.
  useEffect(() => {
    if (spotKey) panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [spotKey])

  if (!detail || !open) return null
  const columns = years.filter((y) => data[y]?.[open.month])
  if (columns.length === 0) return null
  const base = data[baseYear]?.[open.month]

  /** "2026 liegt 16 % darüber" — the year on screen against this one; nothing where there is nothing to divide by. */
  const against = (year: number, month: MonthDetailData) => {
    if (year === baseYear || !base) return null
    const percent = percentChange(base.totalValue, month.totalValue)
    if (percent == null) return null
    if (percent === 0) return { text: t('monthLevel', { year: baseYear }), tone: 'text-muted' }
    return percent > 0
      ? { text: t('monthAbove', { year: baseYear, percent }), tone: 'text-emerald-700 dark:text-emerald-400' }
      : { text: t('monthBelow', { year: baseYear, percent: Math.abs(percent) }), tone: 'text-red-700 dark:text-red-400' }
  }

  const line = (entry: MonthDetailLine) => (
    <li key={entry.key} className="flex items-baseline gap-2 px-4 py-1.5 text-sm">
      <span className="min-w-0 flex-1">
        {entry.href ? (
          <Link href={entry.href} className="font-medium text-accent hover:underline">
            {entry.name}
          </Link>
        ) : (
          <span className="font-medium" title={t('monthSheetLine')}>
            {entry.name}
          </span>
        )}
        <span className="block truncate text-xs text-muted">
          {[entry.number, entry.customer !== entry.name ? entry.customer : ''].filter(Boolean).join(' · ')}
        </span>
      </span>
      {entry.amount && <span className="shrink-0 tabular-nums">{entry.amount}</span>}
    </li>
  )

  const group = (title: string, total: string, count: number, lines: MonthDetailLine[]) =>
    lines.length === 0 ? null : (
      <>
        <p className="flex items-baseline justify-between gap-3 border-y border-border bg-subtle/50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted first:border-t-0">
          <span>
            {title} · {count}
          </span>
          <span className="tabular-nums">{total}</span>
        </p>
        <ul className="divide-y divide-border">{lines.map(line)}</ul>
      </>
    )

  return (
    <section ref={panel} aria-live="polite" className="scroll-mt-24 overflow-hidden rounded-xl border border-accent/40 bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-accent/5 px-4 py-2.5">
        <h2 className="text-sm font-semibold">{monthNames[open.month]}</h2>
        {columns.length > 1 && <span className="text-xs text-muted">{t('monthYearsCompared', { count: columns.length })}</span>}
        <span className="ml-auto flex items-center gap-1">
          {base && (
            <Link href={base.href} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground">
              {t('monthOpenFull')}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
          <button type="button" onClick={detail.close} aria-label={tc('close')} title={tc('close')} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
      </div>

      {/* Every column closes with a rule, so a second row of years stands under a line; the last one hides behind the card's own edge. */}
      <div className={`-mb-px grid md:divide-x md:divide-border ${COLUMNS[Math.min(columns.length, 3) - 1]}`}>
        {columns.map((year) => {
          const month = data[year][open.month]
          const count = month.own.length + month.sub.length
          const all = shownAll.includes(year)
          // Own crew first, then SUB — and the cut falls where it falls across the two.
          const own = all ? month.own : month.own.slice(0, SHOWN)
          const sub = all ? month.sub : month.sub.slice(0, Math.max(0, SHOWN - own.length))
          const hidden = count - own.length - sub.length
          const compared = against(year, month)
          const clicked = columns.length > 1 && year === open.year
          const tone = (tones[year] ?? 0) % TONE_DOT.length
          return (
            <div key={year} className={`min-w-0 border-b border-t-2 border-b-border ${year === baseYear ? 'border-t-accent' : TONE_EDGE[tone]} ${clicked ? 'bg-accent/[0.03]' : ''}`}>
              <div className="px-4 pb-2.5 pt-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <span aria-hidden className={`h-2 w-2 rounded-[3px] ${year === baseYear ? 'bg-accent' : TONE_DOT[tone]}`} />
                  <span className="tabular-nums">{year}</span>
                  {clicked && <span className="rounded-sm bg-accent/10 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{t('monthClicked')}</span>}
                </p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums">{month.total}</p>
                <p className="text-xs text-muted">
                  {t('monthJobs', { count })}
                  {compared && (
                    <>
                      {' · '}
                      <span className={compared.tone}>{compared.text}</span>
                    </>
                  )}
                </p>
              </div>
              {count === 0 ? (
                <p className="border-t border-border px-4 py-4 text-sm text-muted">{t('monthEmpty')}</p>
              ) : (
                <div className="border-t border-border">
                  {group(t('ownPeople'), month.ownTotal, month.own.length, own)}
                  {group(t('sub'), month.subTotal, month.sub.length, sub)}
                  {(hidden > 0 || all) && count > SHOWN && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded({ month: monthKey, years: all ? shownAll.filter((y) => y !== year) : [...shownAll, year] })
                      }
                      className="block w-full border-t border-border px-4 py-1.5 text-left text-xs text-muted hover:bg-surface-hover hover:text-foreground"
                    >
                      {all ? t('monthLess') : t('monthMore', { count: hidden })}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
