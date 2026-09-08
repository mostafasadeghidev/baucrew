'use client'

/**
 * Monthly revenue bar chart (SVG). The year on screen stands as a stacked bar
 * (own + SUB); every year it is compared against gets a plain bar beside it,
 * fainter the further back it lies. When a year plan has been imported, the
 * planned figure crosses the month as a dashed marker.
 *
 * One comparison year is the ordinary case and looks exactly as it always
 * did; four is the most the twelve months can hold before the bars stop being
 * tellable apart, which is why the caller caps the list.
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
  /** Planned revenue for the month; null when nothing was imported. */
  plan?: number | null
}

export type RevenueChartCompare = {
  year: number
  /** What the legend calls it — the year, e.g. "2025". */
  label: string
  /** What its SUB share is called, e.g. "2025 SUB". */
  subLabel: string
  /** Twelve months, own crew and SUB apart. */
  months: Array<{ own: number; sub: number }>
}

/**
 * The further back the year, the fainter its bar. Every year is split the way
 * the year on screen is — the solid foot is own crew, the pale head is SUB —
 * so the reader learns the two tones once, from the coloured bar, and reads
 * them again in every grey one. Four years is the cap.
 */
const COMPARE_OWN = [
  'fill-neutral-400/75',
  'fill-neutral-400/55',
  'fill-neutral-400/38',
  'fill-neutral-400/25',
]
const COMPARE_SUB = [
  'fill-neutral-400/30',
  'fill-neutral-400/22',
  'fill-neutral-400/15',
  'fill-neutral-400/10',
]
const SWATCH_OWN = [
  'bg-neutral-400/75',
  'bg-neutral-400/55',
  'bg-neutral-400/38',
  'bg-neutral-400/25',
]
const SWATCH_SUB = [
  'bg-neutral-400/30',
  'bg-neutral-400/22',
  'bg-neutral-400/15',
  'bg-neutral-400/10',
]

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
 * a short or narrow bar so a sliver does not turn into a lens.
 */
function topBar(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.max(0, Math.min(r, w / 2, h))
  return `M${x} ${y + h}V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}V${y + h}Z`
}

type TipRow = {
  label: string
  value: string
  /** One class for a plain square, two for a square split own/SUB. */
  swatch: string | [string, string] | null
  dashed?: boolean
}

/** The legend mark: a plain square, or one split into its own and SUB tones. */
function Swatch({ swatch }: { swatch: string | [string, string] | null }) {
  if (Array.isArray(swatch))
    return (
      <span aria-hidden className="inline-flex h-2 w-2 shrink-0 flex-col overflow-hidden rounded-[3px]">
        <span className={`h-[40%] w-full ${swatch[1]}`} />
        <span className={`h-[60%] w-full ${swatch[0]}`} />
      </span>
    )
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-[3px] ${swatch ?? ''}`} />
}

export function RevenueChart({
  months,
  compare,
  labels,
  legend,
  locale,
  highlightRange,
}: {
  months: RevenueChartMonth[] // 12 entries
  /** Years laid beside the one on screen, newest first. May be empty. */
  compare: RevenueChartCompare[]
  labels: string[] // 12 short month names
  legend: { own: string; sub: string; plan?: string; total: string }
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
  const series = compare.slice(0, COMPARE_OWN.length)

  const compareTotal = (s: RevenueChartCompare, i: number) =>
    (s.months[i]?.own ?? 0) + (s.months[i]?.sub ?? 0)
  const maxVal = Math.max(
    1,
    ...months.map((m, i) =>
      Math.max(m.own + m.sub, m.plan ?? 0, ...series.map((s) => compareTotal(s, i)))
    )
  )
  const step = niceStep(maxVal)
  const yMax = Math.ceil(maxVal / step) * step
  const y = (v: number) => padT + plotH - (v / yMax) * plotH

  const slot = plotW / 12
  const gap = 3
  // One bar for the year on screen and one per comparison year, together no
  // wider than four fifths of the month — with a single comparison this is
  // the pair of 18px bars the card has always drawn.
  const bars = 1 + series.length
  const groupW = Math.min(slot * 0.8, bars * 18 + (bars - 1) * gap)
  const barW = (groupW - gap * (bars - 1)) / bars
  const groupX = (i: number) => padL + slot * i + (slot - groupW) / 2

  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step)
  const hasPlan = months.some((m) => (m.plan ?? 0) > 0)

  /** Every figure of one month, in the order they are drawn. */
  const rowsOf = (i: number): TipRow[] => {
    const m = months[i]
    const rows: TipRow[] = []
    if (m.sub > 0) rows.push({ label: legend.sub, value: money(m.sub), swatch: 'bg-accent/40' })
    if (m.own > 0) rows.push({ label: legend.own, value: money(m.own), swatch: 'bg-accent' })
    if (m.own > 0 && m.sub > 0)
      rows.push({ label: legend.total, value: money(m.own + m.sub), swatch: null })
    if (m.plan != null && m.plan > 0 && legend.plan)
      rows.push({ label: legend.plan, value: money(m.plan), swatch: null, dashed: true })
    series.forEach((s, n) => {
      const total = compareTotal(s, i)
      if (total <= 0) return
      rows.push({ label: s.label, value: money(total), swatch: [SWATCH_OWN[n], SWATCH_SUB[n]] })
      const sub = s.months[i]?.sub ?? 0
      if (sub > 0) rows.push({ label: s.subLabel, value: money(sub), swatch: SWATCH_SUB[n] })
    })
    if (rows.length === 0) rows.push({ label: legend.total, value: money(0), swatch: null })
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
      rows: rowsOf(active),
      label: labels[active],
      style: toLeft ? { right: edge, marginRight: 8 } : { left: edge, marginLeft: 8 },
    }
  })()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[3px] bg-accent" /> {legend.own}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[3px] bg-accent/40" /> {legend.sub}
        </span>
        {series.map((s, n) => (
          <span key={s.year} className="inline-flex items-center gap-1.5">
            <Swatch swatch={[SWATCH_OWN[n], SWATCH_SUB[n]]} /> {s.label}
          </span>
        ))}
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
          aria-label={[legend.own, legend.sub, ...series.map((s) => s.label)].join(' / ')}
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
            const x0 = groupX(i)
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
                  <path d={topBar(x0, y(cur), barW, y(m.own) - y(cur))} className="fill-accent/40" />
                )}
                {m.own > 0 &&
                  (m.sub > 0 ? (
                    <rect x={x0} y={y(m.own)} width={barW} height={y(0) - y(m.own)} className="fill-accent" />
                  ) : (
                    <path d={topBar(x0, y(m.own), barW, y(0) - y(m.own))} className="fill-accent" />
                  ))}
                {series.map((s, n) => {
                  const own = s.months[i]?.own ?? 0
                  const sub = s.months[i]?.sub ?? 0
                  if (own + sub <= 0) return null
                  const x = x0 + (n + 1) * (barW + gap)
                  return (
                    <g key={s.year}>
                      {sub > 0 && (
                        <path
                          d={topBar(x, y(own + sub), barW, y(own) - y(own + sub))}
                          className={COMPARE_SUB[n]}
                        />
                      )}
                      {own > 0 &&
                        (sub > 0 ? (
                          <rect
                            x={x}
                            y={y(own)}
                            width={barW}
                            height={y(0) - y(own)}
                            className={COMPARE_OWN[n]}
                          />
                        ) : (
                          <path d={topBar(x, y(own), barW, y(0) - y(own))} className={COMPARE_OWN[n]} />
                        ))}
                    </g>
                  )
                })}
                {m.plan != null && m.plan > 0 && (
                  <line
                    x1={x0 - gap}
                    x2={x0 + groupW + gap}
                    y1={y(m.plan)}
                    y2={y(m.plan)}
                    className="stroke-foreground/60"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                  />
                )}
                <text
                  x={padL + slot * i + slot / 2}
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
          {months.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={padL + slot * i}
              y={padT}
              width={slot}
              height={plotH + padB}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${labels[i]}: ${rowsOf(i)
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
                <div key={r.label} className="flex items-center gap-2 whitespace-nowrap">
                  {r.dashed ? (
                    <span
                      aria-hidden
                      className="inline-block h-0 w-2 shrink-0 border-t-2 border-dashed border-foreground/60"
                    />
                  ) : (
                    <Swatch swatch={r.swatch} />
                  )}
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
