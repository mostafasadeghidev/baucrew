/**
 * Revenue per quarter: a ring with the year's four quarters, and under it one
 * line per quarter with its share, its sum and how it stands against the same
 * quarter of the years the office picked to compare with.
 *
 * A server component, plain SVG — it carries no JavaScript and prints as it
 * looks. Every row is a link that makes that quarter the selected period, so
 * the card is also the way into a quarter; clicking the selected one again
 * goes back to the whole year.
 *
 * The middle of the ring names the best quarter rather than repeating the
 * year's sum, which the card above it already carries: the ring's job is to
 * say which part of the year the work sat in, and the biggest slice is the
 * answer a person is looking for.
 */
import Link from 'next/link'

/** How one quarter stands against the same quarter of one other year. */
export type QuarterCompareCell = { year: number; percent: number | null }

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
  labels,
}: {
  rows: QuarterRowView[]
  /** The biggest quarter, for the middle of the ring; null on an empty year. */
  center: { label: string; quarter: string; share: string } | null
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
  const size = 200
  const stroke = 26
  const radius = (size - stroke) / 2
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

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-40 w-40"
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
              arcs.map((a) => (
                <circle
                  key={a.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={stroke}
                  strokeDasharray={a.dash}
                  strokeDashoffset={a.offset}
                />
              ))}
          </g>
          {center ? (
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
          ) : (
            <text x="50%" y="52%" textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
              {labels.empty}
            </text>
          )}
        </svg>
      </div>

      {/* Named once, at the head of the list, rather than four times over: in
          a column this narrow every repeated word costs a figure its room. */}
      <div className="flex items-baseline gap-3 px-2 text-[11px] text-muted">
        <span className="pl-[1.125rem]">{labels.share}</span>
        <span className="ml-auto">{labels.change}</span>
      </div>

      <ul className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={r.label}>
            <Link
              href={r.href}
              aria-current={r.selected ? 'true' : undefined}
              className={`block rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover ${
                r.selected ? 'bg-surface-hover ring-1 ring-inset ring-accent/40' : ''
              }`}
            >
              <span className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-full"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className="text-sm font-medium">{r.label}</span>
                <span className="text-xs text-muted">{r.months}</span>
                {r.running && (
                  <span className="rounded bg-subtle px-1 text-[10px] text-muted">
                    {labels.running}
                  </span>
                )}
                <span className="ml-auto whitespace-nowrap text-sm font-semibold tabular-nums">
                  {r.value}
                </span>
              </span>
              {/* Second line, so the sums stay in one column however many years
                  the office lines this quarter up against. */}
              <span className="mt-0.5 flex items-baseline gap-3 pl-[1.125rem] text-[11px]">
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
