'use client'

/**
 * Monthly revenue chart (SVG), drawn one of three ways.
 *
 * As BARS — the default — every year stands as a stacked bar, solid foot for
 * own crew and pale head for SUB, the year on screen in the accent colour and
 * each compared year in one of its own. As a LINE — rounded through the months
 * or straight from one to the next — or as an AREA under a rounded one, each
 * year is a single stroke: a stroke has room for one figure a month, so the
 * split between own crew and SUB is not in the picture and the bubble gives
 * the year's total instead. Lines carry four or five years where areas start
 * to muddy each other; areas suit the usual pair.
 *
 * Rounded reads as a trend and straight reads as the twelve figures it is
 * made of. The rounding is a monotone spline (see `@/lib/chart-path`): it can
 * neither lift a curve above the highest month it runs between nor push it
 * below the lowest, so no stretch of it ever claims a figure the year has
 * not got.
 *
 * A curve breaks where a month has nothing rather than diving to the floor —
 * a year that is only booked to September has no revenue afterwards, it does
 * not earn zero.
 *
 * When a year plan has been imported, the planned figure crosses the month as
 * a dashed marker.
 *
 * Inside a month the bars run newest to oldest with the year on screen among
 * them in its place: pick 2027 beside 2026 and it stands to the left of it,
 * not after it. With the usual comparison — the year before — that is the pair
 * the card has always drawn, in the order it always drew them.
 *
 * Colours, not shades: four greys of one colour stop telling each other apart
 * on a dark screen, so the first compared year keeps the grey it always had
 * and every further one gets a hue of its own.
 *
 * The figures appear in a bubble that hangs from the top of the chart and
 * always goes to the far side of the month being pointed at — point at March
 * and it sits against the right edge, at October against the left — so it
 * never covers the column it is describing or its neighbours.
 *
 * How much it says depends on how much is in the chart. Only bars can be
 * pointed at one at a time — a curve has no column of its own — so a line or
 * an area always answers for the whole month. With one compared year the whole
 * month answers at once. From two on, a bar answers for itself —
 * point at it and only that year is shown — and the strip carrying the month
 * name under the axis gives every year together, one line each, separated by a
 * dashed rule.
 *
 * Bars are rounded at the very top only: a stack reads as one column, and the
 * seam between own crew and SUB stays a straight line instead of two clipped
 * corners.
 *
 * The browser's `<title>` tooltip is deliberately not used — it waits about a
 * second, cannot be styled and never appears on a touchscreen.
 */

import { Fragment, useId, useState, useEffect, useRef } from 'react'
import { formatCurrency } from '@/lib/format'
import { linePath, monthRuns } from '@/lib/chart-path'

/**
 * Bars; one line per year, rounded through the months or straight from one to
 * the next; or the rounded one with the ground shaded under it.
 */
export type RevenueChartMode = 'bars' | 'line' | 'linear' | 'area'

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
  /** Its own-crew share, e.g. "2025 eigene Leute". */
  ownLabel: string
  /** Its SUB share, e.g. "2025 SUB". */
  subLabel: string
  /** Twelve months, own crew and SUB apart. */
  months: Array<{ own: number; sub: number }>
}

/**
 * One colour per compared year, own crew solid and SUB at the same fraction
 * the accent colour uses, so the split reads the same in every bar. The
 * colours go to the compared years newest first, which leaves the grey on the
 * year before in every ordinary case. Five is the cap — as many as the year
 * picker offers, and as many as a month can hold before the bars stop being
 * tellable apart.
 */
const COMPARE_OWN = [
  'fill-neutral-500/80',
  'fill-sky-500/85',
  'fill-amber-500/85',
  'fill-rose-500/85',
  'fill-teal-500/85',
]
// Weighty enough to be seen on a white card: a fill this pale over white is
// the colour of the gridlines, and the head of the bar disappears into them.
const COMPARE_SUB = [
  'fill-neutral-500/42',
  'fill-sky-500/45',
  'fill-amber-500/45',
  'fill-rose-500/45',
  'fill-teal-500/45',
]
/** The same colours as a stroke, and as `currentColor` for a gradient stop. */
const COMPARE_STROKE = [
  'stroke-neutral-500',
  'stroke-sky-500',
  'stroke-amber-500',
  'stroke-rose-500',
  'stroke-teal-500',
]
const COMPARE_TEXT = [
  'text-neutral-500',
  'text-sky-500',
  'text-amber-500',
  'text-rose-500',
  'text-teal-500',
]
const SWATCH_OWN = [
  'bg-neutral-500/80',
  'bg-sky-500/85',
  'bg-amber-500/85',
  'bg-rose-500/85',
  'bg-teal-500/85',
]
const SWATCH_SUB = [
  'bg-neutral-500/42',
  'bg-sky-500/45',
  'bg-amber-500/45',
  'bg-rose-500/45',
  'bg-teal-500/45',
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
  // A "nice" step can be 2 500, and 2 500 rounded to thousands would label the
  // gridline 3 T€ — a fifth off the line it sits on.
  if (v >= 1_000) return `${(v / 1_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} T€`
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

type TipEntry = {
  label: string
  value: string
  /** One class for a plain square, two for a square split own/SUB. */
  swatch: string | [string, string] | null
  dashed?: boolean
  /**
   * Percent the year on screen stands above or below this one in this month —
   * the same reading the KPI card gives for the whole period. Null where there
   * is nothing to divide by.
   */
  change?: number | null
}

/** One year's entries. Groups are set apart by a dashed rule in the strip. */
type TipGroup = { key: string; entries: TipEntry[] }

/** The mark before an entry: a plain square, or one split into own and SUB. */
function Swatch({ swatch }: { swatch: string | [string, string] | null }) {
  if (Array.isArray(swatch))
    return (
      <span aria-hidden className="inline-flex h-2 w-2 shrink-0 flex-col overflow-hidden rounded-[3px]">
        <span className={`h-[40%] w-full ${swatch[1]}`} />
        <span className={`h-[60%] w-full ${swatch[0]}`} />
      </span>
    )
  if (swatch === null) return <span aria-hidden className="inline-block h-2 w-2 shrink-0" />
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-[3px] ${swatch}`} />
}

/** Which bar of which month the pointer is on; `bar: null` is the whole month. */
type Spot = { month: number; bar: number | null }

/**
 * A bar's place in a month: the year it draws and where its colours come from.
 * `compare` indexes the comparison series, or is -1 for the year on screen.
 */
type Lane = { year: number; compare: number }

export function RevenueChart({
  year,
  months,
  compare,
  mode = 'bars',
  labels,
  legend,
  locale,
  highlightRange,
}: {
  /** The year the months belong to — it takes its place among the others. */
  year: number
  months: RevenueChartMonth[] // 12 entries
  /** Years laid beside it, newest first. May be empty. */
  compare: RevenueChartCompare[]
  mode?: RevenueChartMode
  labels: string[] // 12 short month names
  legend: {
    own: string
    sub: string
    plan?: string
    total: string
    /** Said under a single year's figures, once the bars answer one at a time. */
    wholeMonth: string
    /**
     * What the percentages are measured against, e.g. "vs. 2026". The card
     * under the chart measures each year against the one before it instead, so
     * neither arrow may go without saying which it is.
     */
    changeAgainst: string
  }
  /** Locale for the money format — a server page cannot hand over a function. */
  locale: string
  /** 0-11 inclusive range: dim all months outside it. */
  highlightRange?: { from: number; to: number } | null
}) {
  // Two sources, kept apart: a mouse crossing the chart must not wipe out what
  // the keyboard put up, and letting go of one must fall back to the other.
  const [hover, setHover] = useState<Spot | null>(null)
  const [focused, setFocused] = useState<Spot | null>(null)
  const pointed = hover ?? focused

  /**
   * The chart is drawn at the width it is actually given, in real pixels.
   *
   * It used to be a fixed 960-wide drawing stretched to fit, which meant a
   * wide screen magnified the whole picture — labels, axis figures, bar
   * outlines and all — while every other card on the page kept its type at
   * fourteen pixels and simply grew wider. The chart ended up the one thing
   * that changed size with the window instead of changing shape with it.
   *
   * Measuring instead: the height stays put, the type stays put, and a wider
   * card only puts more room between the months. 960 is what the server draws
   * before the browser has measured anything, and the floor keeps a narrow
   * phone from crushing the axis into the first bar.
   */
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 960, h: 226 })
  useEffect(() => {
    const node = box.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        w: Math.max(560, Math.round(entry.contentRect.width)),
        h: Math.max(200, Math.round(entry.contentRect.height)),
      })
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const W = size.w
  /**
   * The height comes from the card, not from a number in here: the chart
   * shares a row with the quarter card, and a fixed height left whichever of
   * them was shorter ending in a band of nothing. The drawing is taken out of
   * the flow (`absolute inset-0` below) so that measuring the box it sits in
   * cannot end up measuring itself.
   */
  const H = size.h
  const padL = 48
  const padR = 12
  const padT = 12
  const padB = 34
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const money = (v: number) => formatCurrency(v, locale)
  const series = compare.slice(0, COMPARE_OWN.length)
  /**
   * From two compared years on, a bar answers for itself. A curve cannot: it
   * has no column, so a line or an area always answers for the whole month.
   */
  const detailed = mode === 'bars' && series.length >= 2
  const curved = mode !== 'bars'
  const gradientId = useId()

  // Newest year on the left, the year on screen among them where it belongs.
  const lanes: Lane[] = [
    { year, compare: -1 },
    ...series.map((s, n) => ({ year: s.year, compare: n })),
  ].sort((a, b) => b.year - a.year)

  const ownOf = (lane: Lane, i: number) =>
    lane.compare === -1 ? months[i].own : series[lane.compare].months[i]?.own ?? 0
  const subOf = (lane: Lane, i: number) =>
    lane.compare === -1 ? months[i].sub : series[lane.compare].months[i]?.sub ?? 0

  const maxVal = Math.max(
    1,
    ...months.map((m, i) =>
      Math.max(m.own + m.sub, m.plan ?? 0, ...lanes.map((lane) => ownOf(lane, i) + subOf(lane, i)))
    )
  )
  const step = niceStep(maxVal)
  const yMax = Math.ceil(maxVal / step) * step
  const y = (v: number) => padT + plotH - (v / yMax) * plotH

  const slot = plotW / 12
  const gap = 3
  // The bars of a month, together no wider than four fifths of it — with a
  // single comparison this is the pair of 18px bars the card has always drawn.
  const groupW = Math.min(slot * 0.8, lanes.length * 18 + (lanes.length - 1) * gap)
  const barW = (groupW - gap * (lanes.length - 1)) / lanes.length
  const groupX = (i: number) => padL + slot * i + (slot - groupW) / 2
  /**
   * The catch column of bar `j`: the bar plus the gaps beside it, with the
   * outermost stretched to the month's edges so no strip of the month is dead.
   * Splitting the slot evenly instead would put the outer bars' own edges
   * inside their neighbours' columns — the group is narrower than the slot.
   */
  const column = (i: number, j: number) => {
    const slotL = padL + slot * i
    const edge = (k: number) => groupX(i) - gap / 2 + k * (barW + gap)
    const left = j === 0 ? slotL : edge(j)
    const right = j === lanes.length - 1 ? slotL + slot : edge(j + 1)
    return { x: left, width: right - left }
  }

  // Taking a year away can leave a spot pointing at a bar that is no longer
  // there — the pointer has not moved, the chart has. Fall back to the month.
  const active: Spot | null =
    pointed == null
      ? null
      : pointed.bar != null && pointed.bar >= lanes.length
        ? { ...pointed, bar: null }
        : pointed

  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step)
  const hasPlan = months.some((m) => (m.plan ?? 0) > 0)

  /** The year on screen in month `i`, split as it is stacked. */
  const primaryEntries = (i: number): TipEntry[] => {
    const m = months[i]
    const entries: TipEntry[] = []
    if (m.sub > 0) entries.push({ label: legend.sub, value: money(m.sub), swatch: 'bg-accent/40' })
    if (m.own > 0) entries.push({ label: legend.own, value: money(m.own), swatch: 'bg-accent' })
    if (m.own > 0 && m.sub > 0)
      entries.push({ label: legend.total, value: money(m.own + m.sub), swatch: null })
    if (m.plan != null && m.plan > 0 && legend.plan)
      entries.push({ label: legend.plan, value: money(m.plan), swatch: null, dashed: true })
    if (entries.length === 0) entries.push({ label: legend.total, value: money(0), swatch: null })
    return entries
  }

  /** The year on screen in month `i` as one figure, for a line or an area. */
  const primaryTotal = (i: number): TipEntry[] => {
    const m = months[i]
    const entries: TipEntry[] = [
      { label: String(year), value: money(m.own + m.sub), swatch: 'bg-accent' },
    ]
    if (m.plan != null && m.plan > 0 && legend.plan)
      entries.push({ label: legend.plan, value: money(m.plan), swatch: null, dashed: true })
    return entries
  }

  /** One compared year in month `i`, split when there is a split to show. */
  const compareEntries = (n: number, i: number, split: boolean): TipEntry[] => {
    const s = series[n]
    const own = s.months[i]?.own ?? 0
    const sub = s.months[i]?.sub ?? 0
    const total = own + sub
    const mine = months[i].own + months[i].sub
    // Nothing to divide by, or nothing to compare: no number rather than a
    // hundred per cent that would only mean "the other one was empty".
    const change = total > 0 && mine > 0 ? Math.round(((mine - total) / total) * 100) : null
    // The same mark the legend gives it: split where the bars are split, plain
    // where the picture is a single stroke.
    const mark: string | [string, string] = curved
      ? SWATCH_OWN[n]
      : [SWATCH_OWN[n], SWATCH_SUB[n]]
    const totalEntry: TipEntry = { label: s.label, value: money(total), swatch: mark, change }
    if (!split || sub === 0) return [totalEntry]
    return [
      { label: s.subLabel, value: money(sub), swatch: SWATCH_SUB[n] },
      { label: s.ownLabel, value: money(own), swatch: SWATCH_OWN[n] },
      totalEntry,
    ]
  }

  const laneEntries = (lane: Lane, i: number, split: boolean) =>
    lane.compare === -1
      ? curved
        ? primaryTotal(i)
        : primaryEntries(i)
      : compareEntries(lane.compare, i, split && !curved)

  /**
   * What the strip reads out. A bar gives its own year alone; the month gives
   * every year in the order the bars stand, one entry each — and with a single
   * comparison, where nothing is crowded, that one entry becomes the year's
   * full split.
   */
  const groupsOf = (spot: Spot): TipGroup[] => {
    if (spot.bar != null) {
      const lane = lanes[spot.bar]
      return [{ key: String(lane.year), entries: laneEntries(lane, spot.month, true) }]
    }
    return lanes
      .filter((lane) => lane.compare === -1 || ownOf(lane, spot.month) + subOf(lane, spot.month) > 0)
      .map((lane) => ({ key: String(lane.year), entries: laneEntries(lane, spot.month, !detailed) }))
  }

  /** The flat list behind a catch area, for a screen reader. */
  const spokenOf = (spot: Spot) =>
    `${labels[spot.month]}: ${groupsOf(spot)
      .flatMap((g) => g.entries)
      .map((e) => `${e.label} ${e.value}${e.change == null ? '' : ` (${e.change > 0 ? '+' : ''}${e.change} %)`}`)
      .join(', ')}`

  /**
   * A catch area. Only one per month takes a tab stop — the strip under the
   * axis, which reads out every year — so a chart is twelve stops rather than
   * sixty. The bars answer the pointer alone; a keyboard reaches everything
   * they hold through the month they belong to.
   */
  const catchProps = (spot: Spot, focusable: boolean) => ({
    fill: 'transparent',
    tabIndex: focusable ? 0 : -1,
    role: 'img',
    'aria-label': focusable ? spokenOf(spot) : undefined,
    'aria-hidden': focusable ? undefined : true,
    strokeWidth: 2,
    className: `cursor-default outline-none ${
      focusable ? 'focus-visible:fill-foreground/[0.06] focus-visible:stroke-accent' : ''
    }`,
    onPointerEnter: () => setHover(spot),
    onPointerDown: () => setHover(spot),
    onFocus: focusable ? () => setFocused(spot) : undefined,
    onBlur: focusable ? () => setFocused(null) : undefined,
  })

  /**
   * One stroke per year, oldest first so the newest lies on top. A run of
   * months with nothing in them breaks the stroke rather than dragging it down
   * to the floor. Rendered twice when a period is chosen — once faint over the
   * whole year, once again clipped to the period — so the months outside it
   * step back exactly as the bars do.
   */
  const curveLayer = !curved
    ? null
    : [...lanes].reverse().map((lane) => {
        const values = months.map((_, i) => ownOf(lane, i) + subOf(lane, i))
        const lineClass = lane.compare === -1 ? 'stroke-accent' : COMPARE_STROKE[lane.compare]
        return (
          <g key={lane.year} className="pointer-events-none">
            {monthRuns(values).map((run) => {
              const points = run.map(
                (i) => [padL + slot * i + slot / 2, y(values[i])] as [number, number]
              )
              const line = linePath(points, mode !== 'linear')
              const first = points[0]
              const last = points[points.length - 1]
              return (
                <g key={run[0]}>
                  {mode === 'area' && run.length > 1 && (
                    <path
                      d={`${line}L${last[0]} ${y(0)}L${first[0]} ${y(0)}Z`}
                      fill={`url(#${gradientId}-${lane.year})`}
                    />
                  )}
                  <path
                    d={line}
                    fill="none"
                    className={lineClass}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )
            })}
            {active != null && values[active.month] > 0 && (
              <circle
                cx={padL + slot * active.month + slot / 2}
                cy={y(values[active.month])}
                r={3}
                className={`${lineClass} fill-surface`}
                strokeWidth={2}
              />
            )}
          </g>
        )
      })

  // Where the bubble hangs: right against the lit band of the month in hand,
  // on whichever side has the room — so the bars being read stay uncovered and
  // the figures are still next to them rather than off at the card's edge.
  const tip = (() => {
    if (active == null) return null
    const bandLeft = ((padL + slot * active.month) / W) * 100
    const bandRight = ((padL + slot * (active.month + 1)) / W) * 100
    const groups = groupsOf(active)
    return {
      showsChange: groups.some((g) => g.entries.some((e) => e.change != null)),
      groups,
      label: labels[active.month],
      style:
        active.month <= 5
          ? { left: `${bandRight}%`, marginLeft: 6 }
          : { right: `${100 - bandLeft}%`, marginRight: 6 },
    }
  })()

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The legend runs in the order the bars do, so the eye can walk from
          one to the other. The year on screen is the one with a named split.
          It keeps its distance from the drawing: read tight against the top
          bar it looked like an axis label. */}
      <div className="mb-4 flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {lanes.map((lane) =>
          lane.compare === -1 ? (
            curved ? (
              <span key={lane.year} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-[3px] bg-accent" /> {year}
              </span>
            ) : (
              <Fragment key={lane.year}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-[3px] bg-accent" /> {legend.own}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-[3px] bg-accent/40" /> {legend.sub}
                </span>
              </Fragment>
            )
          ) : (
            <span key={lane.year} className="inline-flex items-center gap-1.5">
              <Swatch
                swatch={
                  curved
                    ? SWATCH_OWN[lane.compare]
                    : [SWATCH_OWN[lane.compare], SWATCH_SUB[lane.compare]]
                }
              />{' '}
              {series[lane.compare].label}
            </span>
          )
        )}
        {hasPlan && legend.plan && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-3 border-t-2 border-dashed border-foreground/60" />{' '}
            {legend.plan}
          </span>
        )}
      </div>

      <div
        className="relative min-h-[220px] flex-1"
        ref={box}
        onPointerLeave={() => setHover(null)}
      >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full touch-manipulation"
        role="img"
        aria-label={[
          ...(curved ? [String(year)] : [legend.own, legend.sub]),
          ...series.map((s) => s.label),
        ].join(' / ')}
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
          const dim = highlightRange != null && (i < highlightRange.from || i > highlightRange.to)
          const here = active?.month === i
          return (
            <g key={i} opacity={dim ? 0.35 : 1} className="pointer-events-none">
              {here && (
                <rect
                  x={active.bar == null ? padL + slot * i + 2 : column(i, active.bar).x}
                  y={padT}
                  width={active.bar == null ? slot - 4 : column(i, active.bar).width}
                  height={plotH}
                  rx={6}
                  className="fill-foreground/[0.06]"
                />
              )}
              {!curved &&
                lanes.map((lane, j) => {
                const own = ownOf(lane, i)
                const sub = subOf(lane, i)
                if (own + sub <= 0) return null
                const x = x0 + j * (barW + gap)
                const ownFill = lane.compare === -1 ? 'fill-accent' : COMPARE_OWN[lane.compare]
                const subFill = lane.compare === -1 ? 'fill-accent/40' : COMPARE_SUB[lane.compare]
                return (
                  <g key={lane.year}>
                    {sub > 0 && (
                      <path
                        d={topBar(x, y(own + sub), barW, y(own) - y(own + sub))}
                        className={subFill}
                      />
                    )}
                    {own > 0 &&
                      (sub > 0 ? (
                        <rect x={x} y={y(own)} width={barW} height={y(0) - y(own)} className={ownFill} />
                      ) : (
                        <path d={topBar(x, y(own), barW, y(0) - y(own))} className={ownFill} />
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
                y={H - padB + 17}
                textAnchor="middle"
                className={here ? 'fill-foreground' : 'fill-muted'}
                fontSize={10}
              >
                {labels[i]}
              </text>
            </g>
          )
        })}

        {curveLayer && (
          <>
            <defs>
              {mode === 'area' &&
                lanes.map((lane) => (
                  <linearGradient
                    key={lane.year}
                    id={`${gradientId}-${lane.year}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      className={lane.compare === -1 ? 'text-accent' : COMPARE_TEXT[lane.compare]}
                      stopColor="currentColor"
                      stopOpacity={0.5}
                    />
                    <stop
                      offset="100%"
                      className={lane.compare === -1 ? 'text-accent' : COMPARE_TEXT[lane.compare]}
                      stopColor="currentColor"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                ))}
              {highlightRange && (
                <clipPath id={`${gradientId}-period`}>
                  <rect
                    x={padL + slot * highlightRange.from}
                    y={0}
                    width={slot * (highlightRange.to - highlightRange.from + 1)}
                    height={H}
                  />
                </clipPath>
              )}
            </defs>
            <g opacity={highlightRange ? 0.35 : 1}>{curveLayer}</g>
            {highlightRange && (
              <g clipPath={`url(#${gradientId}-period)`}>{curveLayer}</g>
            )}
          </>
        )}

        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} />

        {/* The catch areas, on top of everything. With one comparison the whole
            column answers; from two on, each bar has its own column and the
            strip carrying the month name gives all the years. */}
        {months.map((_, i) =>
          detailed ? (
            <g key={`hit-${i}`}>
              {lanes.map((lane, j) => (
                <rect
                  key={lane.year}
                  {...column(i, j)}
                  y={padT}
                  height={plotH}
                  {...catchProps({ month: i, bar: j }, false)}
                />
              ))}
              <rect
                x={padL + slot * i}
                y={padT + plotH}
                width={slot}
                height={padB}
                {...catchProps({ month: i, bar: null }, true)}
              />
            </g>
          ) : (
            <rect
              key={`hit-${i}`}
              x={padL + slot * i}
              y={padT}
              width={slot}
              height={plotH + padB}
              {...catchProps({ month: i, bar: null }, true)}
            />
          )
        )}
      </svg>

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-20 rounded-md border border-border bg-surface px-2.5 py-2 text-xs shadow-md"
          style={tip.style}
        >
          <div className="mb-1 flex items-baseline gap-4">
            <p className="font-semibold">{tip.label}</p>
            {tip.showsChange && (
              <span className="ml-auto text-[11px] font-normal text-muted">
                {legend.changeAgainst}
              </span>
            )}
          </div>
          <dl className="space-y-0.5">
            {tip.groups.map((group, gi) => (
              <div key={group.key} className="contents">
                {gi > 0 && <div aria-hidden className="my-1 border-t border-dashed border-border" />}
                {group.entries.map((e) => (
                  <div key={e.label} className="flex items-center gap-2 whitespace-nowrap">
                    {e.dashed ? (
                      <span
                        aria-hidden
                        className="inline-block h-0 w-2 shrink-0 border-t-2 border-dashed border-foreground/60"
                      />
                    ) : (
                      <Swatch swatch={e.swatch} />
                    )}
                    <dt className="text-muted">{e.label}</dt>
                    <dd className="ml-auto font-medium tabular-nums">{e.value}</dd>
                    {tip.showsChange && (
                      <span
                        className={`w-12 shrink-0 text-right tabular-nums ${
                          e.change == null
                            ? ''
                            : e.change >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {e.change == null ? '' : `${e.change >= 0 ? '▲' : '▼'} ${Math.abs(e.change)} %`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </dl>
          {detailed && active?.bar != null && (
            <p className="mt-1.5 border-t border-border pt-1 text-[11px] text-muted">
              {legend.wholeMonth}
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
