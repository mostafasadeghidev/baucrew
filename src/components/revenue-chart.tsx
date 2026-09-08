'use client'

/**
 * Monthly revenue bar chart (SVG). Current year as a stacked bar (own + SUB),
 * previous year as a grey bar beside it, and — when a year plan has been
 * imported — the planned figure as a dashed marker across the month.
 *
 * Bars are rounded at the very top only: a stack reads as one column, and the
 * seam between "own" and "SUB" stays a straight line instead of two clipped
 * corners.
 *
 * Hovering (or tapping, or tabbing to) a month shows every figure of that
 * month at once, in the app's own card style. The browser's `<title>` tooltip
 * is deliberately not used — it waits about a second, cannot be styled and
 * never appears on a touchscreen.
 */

import { useState } from 'react'
import { formatCurrency } from '@/lib/format'

export type RevenueChartMonth = {
  own: number
  sub: number
  prev: number | null
  /** Planned revenue for the month; null when nothing was imported. */
  plan?: number | null
}

function niceStep(max: number): number {
  if (max <= 0) return 1
  const raw = max / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * pow
}

function fmtShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio`
  if (v >= 1_000) return `${Math.round(v / 1_000)} T€`
  return `${Math.round(v)} €`
}

/**
 * A bar with two rounded top corners and a flat foot. The radius shrinks with
 * a short bar so a 2px sliver does not turn into a lens.
 */
function topBar(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.max(0, Math.min(r, w / 2, h))
  return `M${x} ${y + h}V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}V${y + h}Z`
}

const tipRow = 'flex items-center gap-2 whitespace-nowrap'

export function RevenueChart({
  months,
  labels,
  legend,
  locale,
  highlightRange,
}: {
  months: RevenueChartMonth[] // 12 entries
  labels: string[] // 12 short month names
  legend: { own: string; sub: string; prev: string; plan?: string; total: string }
  /** Locale for the money format — a server page cannot hand over a function. */
  locale: string
  /** 0-11 inclusive range: dim all months outside it. */
  highlightRange?: { from: number; to: number } | null
}) {
  const [active, setActive] = useState<number | null>(null)

  const W = 960
  const H = 220
  const padL = 48
  const padR = 12
  const padT = 12
  const padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const money = (v: number) => formatCurrency(v, locale)

  const maxVal = Math.max(1, ...months.map((m) => Math.max(m.own + m.sub, m.prev ?? 0, m.plan ?? 0)))
  const step = niceStep(maxVal)
  const yMax = Math.ceil(maxVal / step) * step
  const y = (v: number) => padT + plotH - (v / yMax) * plotH

  const slot = plotW / 12
  const barW = Math.min(18, slot * 0.26)
  const gap = 3
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step)
  const hasPlan = months.some((m) => (m.plan ?? 0) > 0)

  /** Every figure of one month, in the order they are stacked. */
  const rowsOf = (m: RevenueChartMonth) => {
    const rows: Array<{ label: string; value: string; mark: 'own' | 'sub' | 'prev' | 'plan' | 'none' }> = []
    if (m.sub > 0) rows.push({ label: legend.sub, value: money(m.sub), mark: 'sub' })
    if (m.own > 0) rows.push({ label: legend.own, value: money(m.own), mark: 'own' })
    if (m.own > 0 && m.sub > 0)
      rows.push({ label: legend.total, value: money(m.own + m.sub), mark: 'none' })
    if (m.plan != null && m.plan > 0 && legend.plan)
      rows.push({ label: legend.plan, value: money(m.plan), mark: 'plan' })
    if (m.prev != null && m.prev > 0) rows.push({ label: legend.prev, value: money(m.prev), mark: 'prev' })
    if (rows.length === 0) rows.push({ label: legend.total, value: money(0), mark: 'none' })
    return rows
  }

  // The bubble hangs from the top of the plot and stands next to the month it
  // belongs to — on the far side, so it never covers its own column, and never
  // leaves the card however narrow the screen is.
  const tip = (() => {
    if (active == null) return null
    const cx = padL + slot * active + slot / 2
    const toLeft = active >= 6
    const edge = `${((toLeft ? W - cx : cx) / W) * 100}%`
    return {
      rows: rowsOf(months[active]),
      label: labels[active],
      style: toLeft ? { right: edge, marginRight: 8 } : { left: edge, marginLeft: 8 },
    }
  })()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[3px] bg-accent" /> {legend.own}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[3px] bg-accent/40" /> {legend.sub}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[3px] bg-neutral-400/70" /> {legend.prev}
        </span>
        {hasPlan && legend.plan && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-3 border-t-2 border-dashed border-foreground/60" />{' '}
            {legend.plan}
          </span>
        )}
      </div>

      <div className="relative" onPointerLeave={() => setActive(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-manipulation"
          role="img"
          aria-label={`${legend.own} / ${legend.sub} / ${legend.prev}`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border"
                strokeWidth={1}
                strokeDasharray={t === 0 ? undefined : '3 4'}
              />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-muted" fontSize={10}>
                {fmtShort(t)}
              </text>
            </g>
          ))}

          {months.map((m, i) => {
            const cx = padL + slot * i + slot / 2
            const curX = cx - barW - gap / 2
            const prevX = cx + gap / 2
            const cur = m.own + m.sub
            const dim = highlightRange != null && (i < highlightRange.from || i > highlightRange.to)
            return (
              <g key={i} opacity={dim ? 0.35 : 1} className="pointer-events-none">
                {active === i && (
                  <rect
                    x={padL + slot * i + 2}
                    y={padT}
                    width={slot - 4}
                    height={plotH}
                    rx={6}
                    className="fill-foreground/[0.06]"
                  />
                )}
                {m.sub > 0 && (
                  <path
                    d={topBar(curX, y(cur), barW, y(m.own) - y(cur))}
                    className="fill-accent/40"
                  />
                )}
                {m.own > 0 &&
                  (m.sub > 0 ? (
                    <rect x={curX} y={y(m.own)} width={barW} height={y(0) - y(m.own)} className="fill-accent" />
                  ) : (
                    <path d={topBar(curX, y(m.own), barW, y(0) - y(m.own))} className="fill-accent" />
                  ))}
                {m.plan != null && m.plan > 0 && (
                  <line
                    x1={curX - gap}
                    x2={prevX + barW + gap}
                    y1={y(m.plan)}
                    y2={y(m.plan)}
                    className="stroke-foreground/60"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                  />
                )}
                {m.prev != null && m.prev > 0 && (
                  <path
                    d={topBar(prevX, y(m.prev), barW, y(0) - y(m.prev))}
                    className="fill-neutral-400/70"
                  />
                )}
                <text
                  x={cx}
                  y={H - padB + 16}
                  textAnchor="middle"
                  className={active === i ? 'fill-foreground' : 'fill-muted'}
                  fontSize={10}
                >
                  {labels[i]}
                </text>
              </g>
            )
          })}

          <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} />

          {/* One catch area per month, on top of everything: the whole column
              answers, not an 18px bar. */}
          {months.map((m, i) => (
            <rect
              key={`hit-${i}`}
              x={padL + slot * i}
              y={padT}
              width={slot}
              height={plotH + padB}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${labels[i]}: ${rowsOf(m)
                .map((r) => `${r.label} ${r.value}`)
                .join(', ')}`}
              className="cursor-default outline-none focus-visible:fill-foreground/[0.06]"
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>

        {tip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-20 rounded-md border border-border bg-surface px-2.5 py-2 text-xs shadow-md"
            style={tip.style}
          >
            <p className="mb-1 font-semibold">{tip.label}</p>
            <dl className="space-y-0.5">
              {tip.rows.map((r) => (
                <div key={r.label} className={tipRow}>
                  <span
                    aria-hidden
                    className={
                      r.mark === 'own'
                        ? 'inline-block h-2 w-2 shrink-0 rounded-[3px] bg-accent'
                        : r.mark === 'sub'
                          ? 'inline-block h-2 w-2 shrink-0 rounded-[3px] bg-accent/40'
                          : r.mark === 'prev'
                            ? 'inline-block h-2 w-2 shrink-0 rounded-[3px] bg-neutral-400/70'
                            : r.mark === 'plan'
                              ? 'inline-block h-0 w-2 shrink-0 border-t-2 border-dashed border-foreground/60'
                              : 'inline-block h-2 w-2 shrink-0'
                    }
                  />
                  <dt className="text-muted">{r.label}</dt>
                  <dd className="ml-auto font-medium tabular-nums">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
