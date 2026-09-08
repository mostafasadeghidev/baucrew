/**
 * One bar per year — the company's turnover over several years at once, own
 * crew and SUB apart, newest first. A server component: no JavaScript, it
 * prints as it looks, and every row is a link that makes that year the
 * selected one, so the comparison is also the way to walk into a year.
 *
 * Bars are horizontal on purpose: a year list grows downwards, never sideways,
 * and the year, the bar, the sum and the change read as one line.
 */
import Link from 'next/link'

export type YearBarRow = {
  year: number
  own: number
  sub: number
  total: number
  /** Percent against the year below it in the list; null when there is none. */
  change: number | null
}

export function YearBars({
  rows,
  selected,
  hrefFor,
  formatValue,
  legend,
}: {
  /** Newest year first. */
  rows: YearBarRow[]
  selected: number
  hrefFor: (year: number) => string
  formatValue: (value: number) => string
  legend: { own: string; sub: string }
}) {
  if (rows.length === 0) return null
  const max = Math.max(1, ...rows.map((r) => r.total))
  const pctOf = (v: number) => `${(v / max) * 100}%`

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[3px] bg-accent" /> {legend.own}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[3px] bg-accent/40" /> {legend.sub}
        </span>
      </div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.year}>
            <Link
              href={hrefFor(r.year)}
              aria-current={r.year === selected ? 'true' : undefined}
              className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover sm:grid-cols-[2.5rem_1fr_auto_3.5rem] ${
                r.year === selected ? 'bg-surface-hover' : ''
              }`}
            >
              <span
                className={`text-sm tabular-nums ${
                  r.year === selected ? 'font-semibold text-foreground' : 'text-muted'
                }`}
              >
                {r.year}
              </span>
              <span className="flex h-3 overflow-hidden rounded-full bg-subtle" aria-hidden>
                <span className="bg-accent" style={{ width: pctOf(r.own) }} />
                <span className="bg-accent/40" style={{ width: pctOf(r.sub) }} />
              </span>
              <span className="text-sm font-semibold tabular-nums">{formatValue(r.total)}</span>
              <span
                className={`hidden text-right text-xs tabular-nums sm:block ${
                  r.change == null
                    ? 'text-muted'
                    : r.change >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                }`}
              >
                {r.change == null ? '—' : `${r.change >= 0 ? '▲' : '▼'} ${Math.abs(r.change)} %`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
