/**
 * The revenue tab's months as lanes: a column per month, and the month's sites
 * as tiles in two lanes running across all of them — own people above, SUB
 * below — with each lane's sum under it. The project board, turned to money:
 * a month is read down its column, a lane across the year.
 *
 * The zoom is how many months one screen holds. With three or six a tile is
 * one line — the site's name, and beside it its amount and, for a job that runs
 * over several months, which of them it is ("2/3", in words on hover) — so a
 * busy month stays short; with twelve the tiles become blocks as tall as their
 * amount with the site's name written in them — the shape of the year, still
 * readable. Every tile tells its whole name, customer, amount and months the
 * moment the pointer is on it (`HoverTips`). A period with fewer months than
 * the zoom shares the width among the months it has, and sizes its tiles for
 * that.
 *
 * The box is as tall as its tiles: the page scrolls, not the box.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { PanBox } from '@/components/pan-box'
import { HoverTips } from '@/components/ui/hover-tips'
import { formatCurrency, formatThousands } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import type { MonthRevenue, RevenueProject } from '@/lib/reports'
import { siteKey } from '@/lib/reports-calc'
import type { LanesDensity } from '@/lib/revenue-layout'

type Lane = 'own' | 'sub' | 'extra'
type TileSize = 'wide' | 'compact' | 'mini'

/** The narrowest a month may get at each tile size; below it the box scrolls further. */
const MIN_WIDTH: Record<TileSize, string> = { wide: '15rem', compact: '9.5rem', mini: '4.5rem' }

const dot = (color: string) => <span aria-hidden className={`h-2 w-2 shrink-0 rounded-[3px] ${color}`} />

export async function RevenueLanes({
  months,
  density,
  runningMonth,
  spans,
  extraSpans,
  monthNames,
  locale,
}: {
  /** In the order the tab shows them. */
  months: MonthRevenue[]
  density: LanesDensity
  /** The month (0–11) running today, or −1 in another year. */
  runningMonth: number
  /** Each site's months by site key — the lines outside the sheet kept apart. */
  spans: Map<string, number[]>
  extraSpans: Map<string, number[]>
  monthNames: { long: string[]; short: string[] }
  locale: string
}) {
  const t = await getTranslations('reports')
  const inView = Math.max(1, Math.min(Number(density), months.length))
  const size: TileSize = inView <= 3 ? 'wide' : inView <= 6 ? 'compact' : 'mini'
  const hidePrices = await pricesHidden()
  const exact = (v: number | null) => formatCurrency(v, locale, { hidden: hidePrices })
  const amount = (v: number) =>
    size === 'mini' ? formatThousands(v, locale, hidePrices) : formatCurrency(v, locale, { whole: true, hidden: hidePrices })
  const biggest = Math.max(1, ...months.flatMap((m) => [...m.own, ...m.sub, ...m.extra].map((p) => p.price ?? 0)))
  const between = (i: number) => (i > 0 ? 'border-l' : '')
  const side = 'sticky left-0 z-10 border-r border-t border-border px-3 py-2 text-xs'

  function tile(p: RevenueProject, lane: Lane, month: number) {
    const span = (lane === 'extra' ? extraSpans : spans).get(siteKey(p)) ?? [month]
    // Counted in the calendar, whichever way the months are shown: the job's
    // second month is its second month read backwards too.
    const at = [...span].sort((a, b) => a - b).indexOf(month) + 1
    const place = span.length > 1 ? t('siteSpan', { n: at, count: span.length }) : null
    // The tip's lines: the name first, then who it is for, what it is worth and which month of the job.
    const tip = [p.name, p.customer, exact(p.price), place].filter(Boolean).join('\n')

    if (size === 'mini') {
      // As tall as its amount, and never too short for the name written in it.
      const block = (
        <span
          className={`flex overflow-hidden rounded-sm px-1 text-[10px] leading-4 ${
            lane === 'own'
              ? 'bg-accent/70 text-white'
              : lane === 'sub'
                ? 'bg-accent/35 text-foreground'
                : 'border border-dashed border-muted text-muted'
          }`}
          style={{ height: Math.round(16 + (40 * Math.max(p.price ?? 0, 0)) / biggest) }}
        >
          <span className="min-w-0 truncate">{p.name}</span>
        </span>
      )
      return p.fromSheet ? (
        <div key={p.key} data-tip={tip}>
          {block}
        </div>
      ) : (
        <Link key={p.key} href={`/projects/${p.id}`} data-tip={tip} aria-label={p.name} className="block">
          {block}
        </Link>
      )
    }

    return (
      <div
        key={p.key}
        data-tip={tip}
        className={`flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1 ${
          lane === 'extra' ? 'border-dashed border-border text-muted' : 'border-border'
        } ${size === 'wide' ? 'text-[13px]' : 'text-xs'}`}
      >
        {p.fromSheet ? (
          <span className="min-w-0 truncate">{p.name}</span>
        ) : (
          <Link href={`/projects/${p.id}`} className="min-w-0 truncate text-accent hover:underline">
            {p.name}
          </Link>
        )}
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-muted">
          {span.length > 1 && <span>{`${at}/${span.length}`}</span>}
          <span>{p.price == null ? '—' : amount(p.price)}</span>
        </span>
      </div>
    )
  }

  const header = [
    <div key="corner" className="sticky left-0 top-0 z-30 border-b border-r border-border bg-surface" />,
    ...months.map((m, i) => {
      const running = m.month === runningMonth
      return (
        <div
          key={`head-${m.month}`}
          data-month-col=""
          data-month={m.month}
          className={`sticky top-0 z-20 border-b border-border bg-surface px-2 py-1.5 ${between(i)}`}
        >
          <div
            className={`flex flex-wrap items-baseline justify-between gap-x-2 font-semibold ${
              size === 'mini' ? 'text-xs' : 'text-[13px]'
            }`}
          >
            <span className={running ? 'text-accent' : ''} title={monthNames.long[m.month]}>
              {size === 'mini' ? monthNames.short[m.month] : monthNames.long[m.month]}
            </span>
            <span className="ml-auto tabular-nums" title={exact(m.total)}>
              {amount(m.total)}
            </span>
          </div>
          {m.total > 0 && (
            <div aria-hidden className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-subtle">
              <span className="bg-accent" style={{ width: `${(Math.max(m.ownTotal, 0) / m.total) * 100}%` }} />
              <span className="bg-accent/40" style={{ width: `${(Math.max(m.subTotal, 0) / m.total) * 100}%` }} />
            </div>
          )}
        </div>
      )
    }),
  ]

  const lane = (key: Lane, label: ReactNode) => [
    <div key={`${key}-label`} className={`${side} bg-surface`}>
      {label}
    </div>,
    ...months.map((m, i) => (
      <div
        key={`${key}-${m.month}`}
        className={`flex min-w-0 flex-col gap-1 border-t border-border ${size === 'mini' ? 'p-1' : 'p-1.5'} ${between(i)}`}
      >
        {m[key].map((p) => tile(p, key, m.month))}
      </div>
    )),
  ]

  const sums = (key: 'own' | 'sub', label: string) => [
    <div key={`${key}-sum-label`} className={`${side} bg-subtle text-muted`}>
      {label}
    </div>,
    ...months.map((m, i) => {
      const value = key === 'own' ? m.ownTotal : m.subTotal
      const any = m[key].length > 0
      return (
        <div
          key={`${key}-sum-${m.month}`}
          title={any ? exact(value) : undefined}
          className={`whitespace-nowrap border-t border-border bg-subtle px-2 py-1.5 text-right text-xs font-semibold tabular-nums ${between(i)} ${
            any ? '' : 'text-muted'
          }`}
        >
          {any ? amount(value) : '—'}
        </div>
      )
    }),
  ]

  return (
    <HoverTips>
      <PanBox
        label={t('revenueTitle')}
        zoom={density}
        runningMonth={runningMonth}
        columns={`8rem repeat(${months.length}, max(${MIN_WIDTH[size]}, calc((100% - 8rem) / ${inView})))`}
        printColumns={`8rem repeat(${months.length}, minmax(0, 1fr))`}
        // As tall as its tiles, so nothing scrolls inside it but the months
        // sideways. Keyboard focus scrolls a tile clear of the lane names.
        className="scroll-pl-32 scroll-pt-16 rounded-xl border border-border bg-surface shadow-sm"
      >
        {header}
        {lane(
          'own',
          <span className="flex items-center gap-1.5 font-medium">
            {dot('bg-accent')}
            {t('ownPeople')}
          </span>
        )}
        {sums('own', t('laneOwnTotal'))}
        {lane(
          'sub',
          <span className="flex items-center gap-1.5 font-medium">
            {dot('bg-accent/40')}
            {t('sub')}
          </span>
        )}
        {sums('sub', t('laneSubTotal'))}
        {months.some((m) => m.extra.length > 0) &&
          lane('extra', <span className="italic text-muted">{t('extraTitle')}</span>)}
      </PanBox>
    </HoverTips>
  )
}
