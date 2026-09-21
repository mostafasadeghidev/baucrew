'use client'

/**
 * The jobs behind a month of the revenue chart, shown right under it.
 *
 * A figure in a chart asks "made of what?", and the answer used to be another
 * tab with another year and another month set on it — three things changed to
 * read one list, and the comparison the reader was in was gone. Now a click on
 * a month (or on one year's bar of it) opens the list in place: the chart stays,
 * the years chosen stay, the next month is one click away and a second click on
 * the same month puts the list away again.
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
  own: MonthDetailLine[]
  sub: MonthDetailLine[]
  /** Already formatted. */
  ownTotal: string
  subTotal: string
  total: string
  /** The same month on the Planumsatz tab. */
  href: string
}

export function MonthDetailPanel({
  data,
  monthNames,
}: {
  /** Twelve months for every year in the chart. */
  data: Record<number, MonthDetailData[]>
  monthNames: string[]
}) {
  const t = useTranslations('reports')
  const tc = useTranslations('common')
  const detail = useMonthDetail()
  const panel = useRef<HTMLElement>(null)
  const open = detail?.open ?? null
  const month = open ? data[open.year]?.[open.month] : undefined
  const spotKey = open ? `${open.year}-${open.month}` : ''

  // Brought into view when it opens below the fold — the click should be seen to have done something.
  useEffect(() => {
    if (spotKey) panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [spotKey])

  if (!detail || !open || !month) return null

  const group = (title: string, total: string, lines: MonthDetailLine[]) =>
    lines.length === 0 ? null : (
      <div>
        <p className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span>
            {title} · {lines.length}
          </span>
          <span className="tabular-nums">{total}</span>
        </p>
        <ul className="divide-y divide-border">
          {lines.map((line) => (
            <li key={line.key} className="flex items-baseline gap-3 px-4 py-1.5 text-sm">
              <span className="w-24 shrink-0 truncate text-xs tabular-nums text-muted">{line.number || '—'}</span>
              <span className="min-w-0 flex-1">
                {line.href ? (
                  <Link href={line.href} className="font-medium text-accent hover:underline">
                    {line.name}
                  </Link>
                ) : (
                  <span className="font-medium" title={t('monthSheetLine')}>
                    {line.name}
                  </span>
                )}
                {line.customer && line.customer !== line.name && <span className="ml-2 text-xs text-muted">{line.customer}</span>}
              </span>
              {line.amount && <span className="shrink-0 tabular-nums">{line.amount}</span>}
            </li>
          ))}
        </ul>
      </div>
    )

  const count = month.own.length + month.sub.length

  return (
    <section ref={panel} aria-live="polite" className="scroll-mt-24 overflow-hidden rounded-xl border border-accent/40 bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-accent/5 px-4 py-2.5">
        <h2 className="text-sm font-semibold">
          {monthNames[open.month]} {open.year}
        </h2>
        <span className="text-sm tabular-nums">
          {t('chartTotal')}: <span className="font-semibold">{month.total}</span>
        </span>
        <span className="text-xs text-muted">{t('monthJobs', { count })}</span>
        <span className="ml-auto flex items-center gap-1">
          <Link href={month.href} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground">
            {t('monthOpenFull')}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <button type="button" onClick={detail.close} aria-label={tc('close')} title={tc('close')} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
      </div>
      {count === 0 ? (
        <p className="px-4 py-5 text-sm text-muted">{t('monthEmpty')}</p>
      ) : (
        <div className="max-h-[26rem] overflow-y-auto overscroll-contain">
          {group(t('ownPeople'), month.ownTotal, month.own)}
          {group(t('sub'), month.subTotal, month.sub)}
        </div>
      )}
    </section>
  )
}
