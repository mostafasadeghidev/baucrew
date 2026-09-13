'use client'

/**
 * The Planumsatz by where its money stands — the bars at the top of the
 * Planumsatz tab.
 *
 * Each month's bar is split by the state of the jobs behind its lines: finished,
 * ordered or in work, still an enquiry or offer, or a sheet line no job stands
 * behind. Whether finished work is billed or paid is not told here: that is
 * money by job, and it lives in "Geld ausstehend" on Heute, where it is counted
 * in the job's own value. A month opens below the bars with its lines by state.
 */

import Link from 'next/link'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { InfoHint } from '@/components/ui/info-hint'
import { formatCurrency, formatThousands } from '@/lib/format'
import type { MonthRange } from '@/lib/reports-calc'
import { CLASSES, CLASS_OF, classTotals, type MonthSituation, type PlanClass as Class } from '@/lib/order-situation'

const card = 'rounded-xl border border-border bg-surface shadow-sm'
const up = 'text-emerald-700 dark:text-emerald-400'
const warn = 'text-amber-700 dark:text-amber-400'

/** Literal, so Tailwind finds them. */
const FILL: Record<Class, string> = {
  finished: 'bg-emerald-600',
  ordered: 'bg-accent',
  offered: 'bg-accent/35',
  sheet: 'border border-dashed border-muted',
}

const LABEL = {
  finished: 'classFinished',
  ordered: 'certaintyOrdered',
  offered: 'certaintyOffered',
  sheet: 'classSheet',
} as const

/** Lines shown per list of a month before "+ n more": the month cards below hold the rest. */
const LIST_ROWS = 6

type Row = { key: string; id: string | null; name: string; customer: string; amount: number | null; note: string | null }

const swatch = (c: Class) => <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${FILL[c]}`} />

export function OrderSituation({
  year,
  currentYear,
  runningMonth,
  months,
  average,
  range,
  monthNames,
}: {
  year: number
  currentYear: number
  /** The month (0–11) running today, or −1 in another year. */
  runningMonth: number
  months: MonthSituation[]
  /**
   * What an ordinary month of the last twelve brought, drawn across the bars.
   * The office wanted a line for "does this month cover the costs"; the cost
   * figure is nobody's to guess, and this answers the same question.
   */
  average: number | null
  /** The period picked in the page bar; months outside it are drawn faint. */
  range: MonthRange | null
  monthNames: { long: string[]; short: string[] }
}) {
  const t = useTranslations('reports')
  const locale = useLocale()
  const whole = (v: number) => formatCurrency(v, locale, { whole: true })
  const inRange = (month: number) => !range || (month >= range.from && month <= range.to)
  // The running month is open to begin with, when it is in the period; another year opens with nothing.
  const [selected, setSelected] = useState<number | null>(
    runningMonth >= 0 && inRange(runningMonth) ? runningMonth : null
  )
  const toggle = (next: number) => setSelected(selected === next ? null : next)

  const classes = months.map((m) => ({ month: m, totals: classTotals(m.totals) }))
  // Scaled against what is drawn: a correction below zero adds no height.
  const drawn = (totals: Record<Class, number>) => CLASSES.reduce((sum, c) => sum + Math.max(totals[c], 0), 0)
  const biggest = Math.max(1, ...classes.map(({ month, totals }) => Math.max(drawn(totals), month.lastYear ?? 0)))
  /** A month that is over: what is left in it is a loose end, not work ahead. */
  const behind = (month: number) => year < currentYear || (year === currentYear && month < runningMonth)
  const opened = selected === null ? null : (classes.find((c) => c.month.month === selected) ?? null)
  const rangeTotals = classes
    .filter(({ month }) => inRange(month.month))
    .reduce(
      (sum, { totals }) => {
        for (const c of CLASSES) sum[c] += totals[c]
        return sum
      },
      { finished: 0, ordered: 0, offered: 0, sheet: 0 } as Record<Class, number>
    )

  function message(m: MonthSituation, totals: Record<Class, number>): Array<{ text: string; tone: string }> {
    if (behind(m.month)) {
      const stale = totals.ordered + totals.offered
      if (stale > 0) return [{ text: t('situationMsgStale', { amount: whole(stale) }), tone: warn }]
      if (m.total > 0 && totals.finished === m.total) return [{ text: t('situationMsgClosed'), tone: up }]
      return []
    }
    return [
      {
        text: t('situationMsgAhead', {
          secured: whole(totals.finished + totals.ordered),
          unsure: whole(totals.offered + totals.sheet),
        }),
        tone: '',
      },
    ]
  }

  function lists(m: MonthSituation): Array<{ key: string; title: string; rows: Row[] }> {
    const rows = (wanted: Class[]): Row[] =>
      m.lines
        .filter((l) => wanted.includes(CLASS_OF[l.certainty]))
        .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
        .map((l) => ({ key: l.key, id: l.id, name: l.name, customer: l.customer, amount: l.amount, note: null }))
    const all = [
      ...(behind(m.month)
        ? [{ key: 'stale', title: t('listStale'), rows: rows(['ordered', 'offered']) }]
        : [
            { key: 'ordered', title: t('certaintyOrdered'), rows: rows(['ordered']) },
            { key: 'offered', title: t('listOffered'), rows: rows(['offered']) },
            {
              key: 'offers',
              title: t('listOffersUncounted'),
              rows: [...m.offers]
                .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
                .map((o) => ({
                  key: o.id,
                  id: o.id,
                  name: o.name,
                  customer: o.customer,
                  amount: o.amount,
                  note: t('situationOfferAge', { count: o.ageDays }),
                })),
            },
          ]),
      { key: 'finished', title: t('classFinished'), rows: rows(['finished']) },
      // The sheet's own lines count as not certain in the figures above, so they are named here as well.
      { key: 'sheet', title: t('listSheet'), rows: rows(['sheet']) },
    ]
    return all.filter((list) => list.rows.length > 0)
  }

  const openLists = opened ? lists(opened.month) : []

  return (
    <section className={`${card} space-y-4 p-4 print:[print-color-adjust:exact]`}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        {t('situationTitle')}
        <InfoHint text={t('situationHint')} wide />
      </h2>

      {/* Twelve bars, too narrow for their figures below a tablet's width: the
          year scrolls sideways there instead of squeezing. On paper it takes
          the page's width. */}
      <div className="overflow-x-auto print:overflow-visible">
        <div className="grid min-w-[46rem] grid-cols-[5rem_repeat(12,minmax(0,1fr))] gap-x-1 print:min-w-0">
          <div aria-hidden className="flex flex-col pt-1 text-[11px] text-muted">
            <span className="flex h-36 items-end">{t('situationRevenue')}</span>
            <span className="h-6" />
            <span className="flex h-5 items-center">{t('situationSum')}</span>
          </div>
          {classes.map(({ month: m, totals }) => {
            const isOpen = m.month === selected
            const running = m.month === runningMonth
            return (
              <button
                key={m.month}
                type="button"
                aria-pressed={isOpen}
                aria-label={`${monthNames.long[m.month]} ${year}: ${whole(m.total)}`}
                onClick={() => toggle(m.month)}
                className={`flex min-w-0 flex-col rounded-lg pt-1 transition-colors ${
                  isOpen ? 'bg-subtle' : 'hover:bg-surface-hover'
                } ${inRange(m.month) ? '' : 'opacity-40'}`}
              >
                <span className="relative flex h-36 flex-col-reverse px-1.5">
                  {CLASSES.map((c) =>
                    totals[c] > 0 ? (
                      <span
                        key={c}
                        className={`block shrink-0 ${FILL[c]}`}
                        style={{ height: `${(totals[c] / biggest) * 100}%` }}
                      />
                    ) : null
                  )}
                  {average !== null && average > 0 && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted"
                      style={{ bottom: `${Math.min(100, (average / biggest) * 100)}%` }}
                    />
                  )}
                  {m.lastYear !== null && m.lastYear > 0 && (
                    <span
                      aria-hidden
                      className="absolute left-0 h-1.5 w-1.5 rounded-full bg-muted"
                      style={{ bottom: `calc(${(m.lastYear / biggest) * 100}% - 3px)` }}
                    />
                  )}
                </span>
                <span
                  className={`h-6 truncate pt-1.5 text-center text-[11px] ${
                    running ? 'font-semibold text-accent' : 'text-muted'
                  }`}
                >
                  {monthNames.short[m.month]}
                </span>
                <span className="h-5 whitespace-nowrap text-center text-[11px] tabular-nums">
                  {m.total > 0 ? formatThousands(m.total, locale) : '—'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {CLASSES.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            {swatch(c)}
            {t(LABEL[c])}
            <span className="tabular-nums text-foreground">{whole(rangeTotals[c])}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted" />
          {t('situationLastYear', { year: year - 1 })}
        </span>
        {average !== null && average > 0 && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t border-dashed border-muted" />
            {t('situationAverage')}
          </span>
        )}
      </div>

      {opened && (
        <div className="grid gap-6 border-t border-border pt-4 md:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {monthNames.long[opened.month.month]} {year}
              </h3>
              <span className="text-sm font-semibold tabular-nums">{whole(opened.month.total)}</span>
            </div>
            {message(opened.month, opened.totals).map((part) => (
              <p key={part.text} className={`mt-1 text-[13px] ${part.tone}`}>
                {part.text}
              </p>
            ))}
            <ul className="mt-3 space-y-1 text-[13px]">
              {CLASSES.filter((c) => opened.totals[c] !== 0).map((c) => (
                <li key={c} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    {swatch(c)}
                    <span className="truncate">{t(LABEL[c])}</span>
                  </span>
                  <span className="tabular-nums">{whole(opened.totals[c])}</span>
                </li>
              ))}
              {opened.month.lastYear !== null && (
                <li className="flex justify-between gap-3 border-t border-border pt-1 text-muted">
                  <span>{t('situationLastYear', { year: year - 1 })}</span>
                  <span className="tabular-nums">{whole(opened.month.lastYear)}</span>
                </li>
              )}
            </ul>
          </div>
          <div className="space-y-4">
            {openLists.length === 0 ? (
              <p className="text-[13px] text-muted">{t('situationNothing')}</p>
            ) : (
              openLists.map((list) => (
                <section key={list.key}>
                  <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted">{list.title}</h4>
                  <ul className="mt-1 divide-y divide-border text-[13px]">
                    {list.rows.slice(0, LIST_ROWS).map((row) => (
                      <li key={row.key} className="flex items-center justify-between gap-3 py-1">
                        <span className="min-w-0 truncate" title={row.customer || undefined}>
                          {row.id ? (
                            <Link href={`/projects/${row.id}`} className="text-accent hover:underline">
                              {row.name}
                            </Link>
                          ) : (
                            row.name
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {row.note ? `${row.note} · ` : ''}
                          {row.amount == null ? '—' : whole(row.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {list.rows.length > LIST_ROWS && (
                    <p className="mt-1 text-[11px] text-muted">
                      {t('situationMore', { count: list.rows.length - LIST_ROWS })}
                    </p>
                  )}
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  )
}
