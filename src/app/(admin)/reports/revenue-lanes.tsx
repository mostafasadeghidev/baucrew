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
 * A tile's colour is where its money stands — finished, ordered, offered, or
 * only in the plan — the four states of "Planumsatz nach Stand", and the bar
 * under each month's head splits the month the same way. Own people and SUB
 * are told apart by their lanes. A job that runs over several months lights up
 * in all of them while the pointer is on one (`HoverGroups`).
 *
 * The box is as tall as its tiles: the page scrolls, not the box.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { PanBox } from '@/components/pan-box'
import { HoverGroups } from '@/components/ui/hover-groups'
import { HoverTips } from '@/components/ui/hover-tips'
import { formatCurrency, formatThousands } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import {
  CLASSES,
  CLASS_OF,
  certaintyOf,
  certaintyTotals,
  classTotals,
  type PlanClass,
} from '@/lib/order-situation'
import type { MonthRevenue, RevenueProject } from '@/lib/reports'
import { siteKey } from '@/lib/reports-calc'
import type { LanesDensity } from '@/lib/revenue-layout'

type Lane = 'own' | 'sub' | 'extra'
type TileSize = 'wide' | 'compact' | 'mini'

/** The narrowest a month may get at each tile size; below it the box scrolls further. */
const MIN_WIDTH: Record<TileSize, string> = { wide: '15rem', compact: '9.5rem', mini: '4.5rem' }

/** The colours of "Planumsatz nach Stand". Literal, so Tailwind finds them. */
const FILL: Record<PlanClass, string> = {
  finished: 'bg-emerald-600',
  ordered: 'bg-accent',
  offered: 'bg-accent/35',
  sheet: 'border border-dashed border-muted',
}
/** A block filled with that colour, and writing that stays legible on it. */
const BLOCK: Record<PlanClass, string> = {
  finished: 'bg-emerald-600 text-white',
  ordered: 'bg-accent text-white',
  offered: 'bg-accent/35 text-foreground',
  sheet: 'border border-dashed border-muted text-muted',
}
const LABEL = {
  finished: 'classFinished',
  ordered: 'certaintyOrdered',
  offered: 'certaintyOffered',
  sheet: 'classSheet',
} as const

/** While one job is lit, every other tile steps back; the lit ones are ringed. */
const LIGHTING =
  'transition-opacity [[data-lighting]_&:not([data-lit])]:opacity-35 data-[lit]:ring-2 data-[lit]:ring-foreground/70 data-[lit]:ring-offset-1 data-[lit]:ring-offset-surface'

const swatch = (cls: PlanClass) => <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${FILL[cls]}`} />

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
    const cls = CLASS_OF[certaintyOf(p.fromSheet ? undefined : p.status, p.settled)]
    // The tip's lines: the name first, then who it is for, where its money stands,
    // what it is worth and which month of the job.
    const tip = [p.name, p.customer, t(LABEL[cls]), exact(p.price), place].filter(Boolean).join('\n')
    // The lines outside the sheet are a lane apart; a job lights up within its own kind of lane.
    const group = `${lane === 'extra' ? 'extra' : 'sheet'}:${siteKey(p)}`

    if (size === 'mini') {
      // As tall as its amount, and never too short for the name written in it.
      const block = (
        <span
          className={`flex overflow-hidden rounded-sm px-1 text-[10px] leading-4 ${
            lane === 'extra' ? 'border border-dashed border-muted text-muted' : BLOCK[cls]
          }`}
          style={{ height: Math.round(16 + (40 * Math.max(p.price ?? 0, 0)) / biggest) }}
        >
          <span className="min-w-0 truncate">{p.name}</span>
        </span>
      )
      return p.fromSheet ? (
        <div key={p.key} data-tip={tip} data-group={group} className={`rounded-sm ${LIGHTING}`}>
          {block}
        </div>
      ) : (
        <Link
          key={p.key}
          href={`/projects/${p.id}`}
          data-tip={tip}
          data-group={group}
          aria-label={p.name}
          className={`block rounded-sm ${LIGHTING}`}
        >
          {block}
        </Link>
      )
    }

    return (
      <div
        key={p.key}
        data-tip={tip}
        data-group={group}
        className={`flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1 ${LIGHTING} ${
          lane === 'extra' ? 'border-dashed border-border text-muted' : 'border-border'
        } ${size === 'wide' ? 'text-[13px]' : 'text-xs'}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {lane !== 'extra' && swatch(cls)}
          {p.fromSheet ? (
            <span className="min-w-0 truncate">{p.name}</span>
          ) : (
            <Link href={`/projects/${p.id}`} className="min-w-0 truncate text-accent hover:underline">
              {p.name}
            </Link>
          )}
        </span>
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
            // The month split by where its money stands, surest first.
            <div aria-hidden className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-subtle">
              {(() => {
                const classes = classTotals(certaintyTotals([...m.own, ...m.sub]))
                return CLASSES.filter((cls) => cls !== 'sheet').map((cls) => (
                  <span
                    key={cls}
                    className={FILL[cls]}
                    style={{ width: `${(Math.max(classes[cls], 0) / m.total) * 100}%` }}
                  />
                ))
              })()}
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
    <div className="space-y-2">
      {/* What the colours say, over the box. */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span>{t('lanesLegend')}</span>
        {CLASSES.map((cls) => (
          <span key={cls} className="flex items-center gap-1.5">
            {swatch(cls)}
            {t(LABEL[cls])}
          </span>
        ))}
      </p>
      <HoverGroups>
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
            {lane('own', <span className="font-medium">{t('ownPeople')}</span>)}
            {sums('own', t('laneOwnTotal'))}
            {lane('sub', <span className="font-medium">{t('sub')}</span>)}
            {sums('sub', t('laneSubTotal'))}
            {months.some((m) => m.extra.length > 0) &&
              lane('extra', <span className="italic text-muted">{t('extraTitle')}</span>)}
          </PanBox>
        </HoverTips>
      </HoverGroups>
    </div>
  )
}
