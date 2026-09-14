/**
 * The revenue tab's year matrix: a row per site, a column per month. A job that
 * runs from March into June is one bar across four cells, and the darker a
 * cell, the more that month brought — so the year is one table that says which
 * job ran when, and what it was worth.
 *
 * Rows run as a staircase, by the month a site starts in. The zoom is how much
 * a cell says: its shade alone, which fits the year without scrolling; the
 * amount in thousands; or the amount in full. Under the sites stand the
 * months' sums as the other layouts show them, the last pinned to the bottom
 * of the box; below those, set apart, the projects that are not in the sheet
 * and so in none of the sums.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { PanBox } from '@/components/pan-box'
import { formatCurrency, formatThousands } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import type { MonthRevenue } from '@/lib/reports'
import { heatLevel, type SiteMonthRow } from '@/lib/reports-calc'
import type { MatrixDensity } from '@/lib/revenue-layout'

/** A month column's width: enough for what a cell says at that zoom, and the rest shared out. */
const CELL: Record<MatrixDensity, string> = {
  color: 'minmax(1.75rem, 1fr)',
  short: 'minmax(4rem, 1fr)',
  full: 'minmax(5.5rem, 1fr)',
}

/** Light to dark. Literal, so Tailwind finds them. */
const HEAT = ['bg-accent/10', 'bg-accent/20', 'bg-accent/35', 'bg-accent/50']

export async function RevenueMatrix({
  rows,
  extraRows,
  months,
  density,
  runningMonth,
  monthNames,
  locale,
}: {
  rows: SiteMonthRow[]
  /** The projects that are not in the sheet, as rows of their own. */
  extraRows: SiteMonthRow[]
  /** In the order the tab shows them. */
  months: MonthRevenue[]
  density: MatrixDensity
  /** The month (0–11) running today, or −1 in another year. */
  runningMonth: number
  monthNames: { long: string[]; short: string[]; narrow: string[] }
  locale: string
}) {
  const t = await getTranslations('reports')
  const order = months.map((m) => m.month)
  const hidePrices = await pricesHidden()
  const exact = (v: number) => formatCurrency(v, locale, { hidden: hidePrices })
  const whole = (v: number) => formatCurrency(v, locale, { whole: true, hidden: hidePrices })
  const figure = (v: number) => (density === 'full' ? whole(v) : formatThousands(v, locale, hidePrices))
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
  const biggest = Math.max(1, ...rows.flatMap((r) => Object.values(r.cells).map((c) => c.own + c.sub)))
  const yearTotal = sum(months.map((m) => m.total))

  const line = 'border-b border-border/60'
  const head = 'sticky top-0 border-b border-border bg-surface py-2 text-[11px] font-medium uppercase tracking-wide'

  function siteRow(r: SiteMonthRow, extra: boolean) {
    const subShare = sum(Object.values(r.cells).map((c) => c.sub))
    return [
      <div
        key={`${r.key}-name`}
        title={r.customer || undefined}
        className={`sticky left-0 z-10 flex min-w-0 items-center gap-1.5 border-r bg-surface px-3 py-1 text-[13px] ${line}`}
      >
        {r.id ? (
          <Link href={`/projects/${r.id}`} className={`truncate hover:underline ${extra ? 'text-muted' : 'text-accent'}`}>
            {r.name}
          </Link>
        ) : (
          <span className={`truncate ${extra ? 'text-muted' : ''}`}>{r.name}</span>
        )}
        {!extra && subShare * 2 > r.total && (
          <span className="shrink-0 rounded bg-subtle px-1 text-[10px] font-medium text-muted">{t('sub')}</span>
        )}
      </div>,
      ...order.map((month, i) => {
        const cell = r.cells[month]
        if (!cell) return <div key={`${r.key}-${month}`} className={line} />
        const value = cell.own + cell.sub
        // A run of months is one bar: rounded and inset only where it starts
        // and ends. Only months that follow each other in the calendar join —
        // two cells side by side with a hidden month between them do not.
        const joins = (j: number) =>
          j >= 0 && j < order.length && Math.abs(order[j] - month) === 1 && r.cells[order[j]] !== undefined
        const joinsBefore = joins(i - 1)
        const joinsAfter = joins(i + 1)
        const split =
          cell.own > 0 && cell.sub > 0
            ? ` (${t('ownPeople')} ${whole(cell.own)} · ${t('sub')} ${whole(cell.sub)})`
            : ''
        return (
          <div key={`${r.key}-${month}`} className={`flex items-center py-1 ${line}`}>
            <div
              title={`${r.name} · ${monthNames.long[month]}: ${exact(value)}${split}`}
              className={`h-6 min-w-0 flex-1 overflow-hidden whitespace-nowrap px-1 text-center text-[11px] leading-6 tabular-nums ${
                extra ? 'border border-dashed border-border text-muted' : HEAT[heatLevel(value, biggest, HEAT.length)]
              } ${joinsBefore ? '' : 'ml-0.5 rounded-l'} ${joinsAfter ? '' : 'mr-0.5 rounded-r'}`}
            >
              {density === 'color' ? null : figure(value)}
            </div>
          </div>
        )
      }),
      <div
        key={`${r.key}-total`}
        title={exact(r.total)}
        className={`whitespace-nowrap px-3 py-1 text-right text-[13px] tabular-nums ${line} ${extra ? 'text-muted' : ''}`}
      >
        {whole(r.total)}
      </div>,
    ]
  }

  const header = [
    <div key="corner" className={`${head} left-0 z-30 border-r px-3 text-left text-muted`}>
      {t('matrixSite')}
    </div>,
    ...months.map((m) => {
      const running = m.month === runningMonth
      return (
        <div
          key={`head-${m.month}`}
          data-month-col=""
          data-month={m.month}
          title={monthNames.long[m.month]}
          className={`${head} z-20 text-center ${running ? 'text-accent' : 'text-muted'}`}
        >
          {density === 'color' ? monthNames.narrow[m.month] : monthNames.short[m.month]}
        </div>
      )
    }),
    <div key="head-total" className={`${head} z-20 px-3 text-right text-muted`}>
      {t('matrixTotal')}
    </div>,
  ]

  // The sums under the sites. The last row — the months' totals — is pinned to
  // the bottom of the box, so it is in view whichever site is.
  const footLabel = (key: string, label: string, pinned = false) => (
    <div
      key={key}
      className={`sticky left-0 border-r border-t border-border bg-subtle px-3 py-1.5 text-xs ${
        pinned ? 'bottom-0 z-30 font-semibold' : 'z-10 text-muted'
      }`}
    >
      {label}
    </div>
  )
  const footCell = (
    key: string,
    content: ReactNode,
    { pinned = false, title, total = false }: { pinned?: boolean; title?: string; total?: boolean } = {}
  ) => (
    <div
      key={key}
      title={title}
      className={`whitespace-nowrap border-t border-border bg-subtle py-1.5 text-xs tabular-nums ${
        total ? 'px-3 text-right' : 'px-1 text-center'
      } ${pinned ? 'sticky bottom-0 z-20 font-semibold' : ''}`}
    >
      {content}
    </div>
  )

  const footer: ReactNode[] = []
  // Figures need a cell wide enough to hold them; at the narrowest zoom the
  // totals row carries the split as a bar instead.
  if (density !== 'color') {
    for (const key of ['own', 'sub'] as const) {
      const values = months.map((m) => (key === 'own' ? m.ownTotal : m.subTotal))
      footer.push(
        footLabel(`${key}-label`, key === 'own' ? t('ownPeople') : t('sub')),
        ...months.map((m, i) =>
          footCell(`${key}-${m.month}`, m[key].length > 0 ? figure(values[i]) : '—', { title: exact(values[i]) })
        ),
        footCell(`${key}-total`, whole(sum(values)), { total: true, title: exact(sum(values)) })
      )
    }
  }
  const biggestMonth = Math.max(1, ...months.map((m) => m.total))
  footer.push(
    footLabel('total-label', t('matrixTotal'), true),
    ...months.map((m) =>
      footCell(
        `total-${m.month}`,
        density === 'color' ? (
          <span aria-hidden className="mx-auto flex h-8 w-2.5 flex-col justify-end">
            <span
              className="rounded-t-sm bg-accent/40"
              style={{ height: `${(Math.max(m.subTotal, 0) / biggestMonth) * 100}%` }}
            />
            <span className="bg-accent" style={{ height: `${(Math.max(m.ownTotal, 0) / biggestMonth) * 100}%` }} />
          </span>
        ) : (
          figure(m.total)
        ),
        { pinned: true, title: exact(m.total) }
      )
    ),
    footCell('total-total', whole(yearTotal), { pinned: true, total: true, title: exact(yearTotal) })
  )

  return (
    <PanBox
      label={t('revenueTitle')}
      zoom={density}
      runningMonth={runningMonth}
      columns={`minmax(11rem, 18rem) repeat(${order.length}, ${CELL[density]}) 7rem`}
      printColumns={`minmax(8rem, 12rem) repeat(${order.length}, minmax(0, 1fr)) 5rem`}
      // No taller than the window less the page's pinned bar and tabs (about
      // nine rem) and the gap under them, so the month heads and the pinned
      // totals are on screen together. Keyboard focus scrolls a cell clear of
      // the pinned heads, names and totals.
      className="max-h-[calc(100vh-11.5rem)] scroll-pb-12 scroll-pl-44 scroll-pt-10 rounded-xl border border-border bg-surface shadow-sm"
    >
      {header}
      {rows.flatMap((r) => siteRow(r, false))}
      {footer}
      {extraRows.length > 0 && (
        <>
          <div
            style={{ gridColumn: '1 / -1' }}
            className="border-b border-t border-border bg-surface py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted"
          >
            <span className="sticky left-0 inline-block px-3">{t('extraTitle')}</span>
          </div>
          {extraRows.flatMap((r) => siteRow(r, true))}
        </>
      )}
    </PanBox>
  )
}
