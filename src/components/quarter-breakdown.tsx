'use client'

/**
 * Revenue per quarter: a ring with the year's four quarters, and under it one
 * line per quarter with its share, its sum and how it stands against the same
 * quarter of the years the office picked to compare with.
 *
 * Every row is a link that makes that quarter the selected period, so the card
 * is also the way into a quarter; clicking the selected one again goes back to
 * the whole year.
 *
 * The middle of the ring names the best quarter rather than repeating the
 * year's sum, which the card above it already carries: the ring's job is to
 * say which part of the year the work sat in, and the biggest slice is the
 * answer a person is looking for.
 *
 * Resting on a slice — or on the row that belongs to it — puts the figures
 * behind it in a bubble over the ring: this year's sum for that quarter and
 * each compared year's, so the percentages beside it can be checked against
 * the numbers they came from. The slice thickens at the same time, because a
 * bubble that does not say which slice it belongs to is a bubble about
 * nothing.
 */
import { useState } from 'react'
import Link from 'next/link'

/** How one quarter stands against the same quarter of one other year. */
export type QuarterCompareCell = {
  year: number
  percent: number | null
  /** That year's own sum for this quarter, already formatted. */
  value: string
}

export type QuarterRowView = {
  /** "Q1" … "Q4". */
  label: string
  /** The months it spans, spelled short: "Jan–Mär". */
  months: string
  /** Already formatted in the reader's currency. */
  value: string
  /** Of the whole year, 0..1. */
  share: number
  compare: QuarterCompareCell[]
  href: string
  selected: boolean
  /** The quarter today falls in — its months are not all behind us yet. */
  running: boolean
}

const COLORS = [
  'var(--accent)',
  'color-mix(in srgb, var(--accent) 65%, white)',
  'color-mix(in srgb, var(--accent) 40%, white)',
  'color-mix(in srgb, var(--accent) 22%, white)',
]

export function QuarterBreakdown({
  rows,
  center,
  year,
  labels,
}: {
  rows: QuarterRowView[]
  /** The biggest quarter, for the middle of the ring; null on an empty year. */
  center: { label: string; quarter: string; share: string } | null
  /** The year the card stands on, named in the bubble above the compared ones. */
  year: number
  labels: {
    /** Heads the left-hand number, e.g. "Anteil am Jahr". */
    share: string
    /** Heads the right-hand numbers, e.g. "Veränderung". */
    change: string
    /** The word beside the quarter that is still running, e.g. "läuft". */
    running: string
    /** Shown instead of the ring when the year has nothing in it. */
    empty: string
  }
}) {
  /**
   * Which quarter is lit, and whether the pointer found it on the ring or in
   * the list — because the bubble has to keep out of the way of whichever of
   * the two the reader is actually looking at.
   */
  const [hover, setHover] = useState<{ index: number; from: 'arc' | 'row' } | null>(null)
  const size = 200
  const stroke = 26
  /** How much a slice thickens while it is pointed at. */
  const grow = 8
  /**
   * The ring is drawn a few pixels inside the box rather than against it: a
   * slice grows outwards as well as inwards while it is lit, and drawn at the
   * full radius the grown edge was simply cut off by the side of the drawing.
   */
  const radius = (size - stroke - grow) / 2 - 1
  const circumference = 2 * Math.PI * radius

  let offset = 0
  const arcs = rows.map((r, i) => {
    const arc = {
      key: r.label,
      color: COLORS[i % COLORS.length],
      dash: `${Math.max(0, r.share) * circumference} ${circumference}`,
      offset: -offset * circumference,
    }
    offset += Math.max(0, r.share)
    return arc
  })

  const lit = hover === null ? null : rows[hover.index]

  return (
    <div className="space-y-2" onPointerLeave={() => setHover(null)}>
      <div className="relative flex justify-center">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-32 w-32"
          role="img"
          aria-label={center ? `${center.label}: ${center.quarter} ${center.share}` : labels.empty}
        >
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--subtle)"
              strokeWidth={stroke}
            />
            {center &&
              arcs.map((a, i) => (
                <circle
                  key={a.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={hover?.index === i ? stroke + grow : stroke}
                  strokeDasharray={a.dash}
                  strokeDashoffset={a.offset}
                  className="cursor-pointer transition-[stroke-width]"
                  style={{ pointerEvents: 'stroke' }}
                  onPointerEnter={() => setHover({ index: i, from: 'arc' })}
                />
              ))}
          </g>
          {center && !lit && (
            <>
              <text x="50%" y="42%" textAnchor="middle" className="fill-[var(--muted)] text-[10px]">
                {center.label}
              </text>
              <text
                x="50%"
                y="56%"
                textAnchor="middle"
                className="fill-[var(--foreground)] text-[22px] font-semibold"
              >
                {center.quarter}
              </text>
              <text x="50%" y="68%" textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
                {center.share}
              </text>
            </>
          )}
          {!center && (
            <text x="50%" y="52%" textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
              {labels.empty}
            </text>
          )}
        </svg>

        {/* The bubble covers whichever half the pointer is not on: come from a
            row and it sits over the ring, come from a slice and it drops below
            it. A bubble over the thing you are pointing at answers a question
            you can no longer see. */}
        {lit && (
          <div
            className={`pointer-events-none absolute inset-x-0 z-10 rounded-lg border border-border bg-surface p-2.5 text-[11px] shadow-md ${
              hover?.from === 'arc' ? 'top-full mt-1' : 'top-0'
            }`}
          >
            <p className="mb-1 flex items-baseline gap-1.5 font-medium">
              {lit.label}
              <span className="text-muted">{lit.months}</span>
            </p>
            <dl className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="tabular-nums text-muted">{year}</dt>
                <dd className="font-semibold tabular-nums">{lit.value}</dd>
              </div>
              {lit.compare.map((c) => (
                <div key={c.year} className="flex items-baseline justify-between gap-3">
                  <dt className="tabular-nums text-muted">{c.year}</dt>
                  {/* The change first and the sum last, so every year's sum
                      ends on the same column as the one above it — including
                      the year on screen, which has no change to show. */}
                  <dd className="flex items-baseline gap-2">
                    <span className={`tabular-nums ${tone(c.percent)}`}>{arrow(c.percent)}</span>
                    <span className="tabular-nums">{c.value}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {/* Named once, at the head of the list, rather than four times over: in
          a column this narrow every repeated word costs a figure its room. */}
      <div className="flex items-baseline gap-3 px-2 text-[10px] text-muted">
        <span className="pl-[1.125rem]">{labels.share}</span>
        <span className="ml-auto">{labels.change}</span>
      </div>

      <ul className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={r.label}>
            <Link
              href={r.href}
              aria-current={r.selected ? 'true' : undefined}
              onPointerEnter={() => setHover({ index: i, from: 'row' })}
              className={`block rounded-md px-2 py-1 transition-colors hover:bg-surface-hover ${
                r.selected ? 'bg-surface-hover ring-1 ring-inset ring-accent/40' : ''
              }`}
            >
              <span className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-full"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className="text-[13px] font-medium">{r.label}</span>
                <span className="text-[11px] text-muted">{r.months}</span>
                {r.running && (
                  <span className="rounded bg-subtle px-1 text-[9px] text-muted">
                    {labels.running}
                  </span>
                )}
                <span className="ml-auto whitespace-nowrap text-[13px] font-semibold tabular-nums">
                  {r.value}
                </span>
              </span>
              {/* Second line, so the sums stay in one column however many years
                  the office lines this quarter up against. */}
              <span className="flex items-baseline gap-3 pl-[1.125rem] text-[10px]">
                <span className="tabular-nums text-muted">{percent(r.share)}</span>
                <span className="ml-auto flex flex-wrap justify-end gap-x-3 gap-y-0.5">
                  {r.compare.map((c) => (
                    <span key={c.year} className="whitespace-nowrap tabular-nums">
                      <span className="text-muted">{c.year}</span>{' '}
                      <span className={tone(c.percent)}>{arrow(c.percent)}</span>
                    </span>
                  ))}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

const percent = (share: number) => `${Math.round(share * 100)} %`

const arrow = (p: number | null) => (p == null ? '—' : `${p >= 0 ? '▲' : '▼'} ${Math.abs(p)} %`)

const tone = (p: number | null) =>
  p == null
    ? 'text-muted'
    : p >= 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-red-700 dark:text-red-400'
