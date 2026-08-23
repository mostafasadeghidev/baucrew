import Link from 'next/link'
import { addDays, iso } from '@/lib/dates'

export type WeekDay = {
  iso: string
  weekday: string
  dayNumber: string
  jobs: number
  isToday: boolean
  isSelected: boolean
}

/**
 * The worker's week at a glance: seven tap targets with a dot per assignment,
 * so "where am I this week?" is answered without paging day by day.
 */
export function WeekStrip({
  days,
  prevWeek,
  nextWeek,
  weekLabel,
}: {
  days: WeekDay[]
  prevWeek: Date
  nextWeek: Date
  weekLabel: string
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-2 shadow-sm">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <Link
          href={`/my?date=${iso(prevWeek)}`}
          aria-label="←"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          ←
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{weekLabel}</p>
        <Link
          href={`/my?date=${iso(nextWeek)}`}
          aria-label="→"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          →
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <Link
            key={d.iso}
            href={`/my?date=${d.iso}`}
            aria-current={d.isSelected ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 rounded-lg py-2 text-center transition-colors ${
              d.isSelected
                ? 'bg-accent text-accent-foreground'
                : d.isToday
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted hover:bg-surface-hover'
            }`}
          >
            <span className="text-[11px] uppercase">{d.weekday}</span>
            <span className="text-base font-semibold tabular-nums">{d.dayNumber}</span>
            <span className="flex h-1.5 items-center gap-0.5">
              {Array.from({ length: Math.min(d.jobs, 3) }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    d.isSelected ? 'bg-accent-foreground' : 'bg-accent'
                  }`}
                />
              ))}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** Seven days starting at `monday`, enriched with the number of assignments. */
export function buildWeek(
  monday: Date,
  selected: Date,
  today: Date,
  jobsPerDay: Map<string, number>,
  weekdayFmt: Intl.DateTimeFormat
): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i)
    const key = iso(d)
    return {
      iso: key,
      weekday: weekdayFmt.format(d),
      dayNumber: String(d.getUTCDate()).padStart(2, '0'),
      jobs: jobsPerDay.get(key) ?? 0,
      isToday: key === iso(today),
      isSelected: key === iso(selected),
    }
  })
}
