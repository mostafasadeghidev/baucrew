import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { addDays, utcDate, iso, isoWeek } from '@/lib/dates'

export type MonthEntry = {
  id: string
  date: string
  projectName: string
  time: string
  vehicles: string
  hasConflict: boolean
}

const MAX_PER_DAY = 3

export async function MonthView({
  showWeekend = false,
  monthStartIso,
  gridStartIso,
  gridEndIso,
  todayIso,
  prevHref,
  nextHref,
  currentHref,
  weekHref,
  overviewHref,
  entries,
  locale,
}: {
  showWeekend?: boolean
  monthStartIso: string
  gridStartIso: string
  gridEndIso: string
  todayIso: string
  prevHref: string
  nextHref: string
  currentHref: string
  weekHref: string
  overviewHref: string
  entries: MonthEntry[]
  locale: string
}) {
  const t = await getTranslations('schedule')
  const monthStart = utcDate(monthStartIso)
  const monthLabel = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(monthStart)
  const weekdayFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    timeZone: 'UTC',
  })

  // Week rows Mon–Fri like the paper Wochenplan; Sa/So added when the month has weekend assignments.
  const dayCount = showWeekend ? 7 : 5
  const weeks: string[][] = []
  for (let d = utcDate(gridStartIso); d < utcDate(gridEndIso); d = addDays(d, 7)) {
    weeks.push(Array.from({ length: dayCount }, (_, i) => iso(addDays(d, i))))
  }
  const byDay = new Map<string, MonthEntry[]>()
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const inMonth = (dayIso: string) => dayIso.slice(0, 7) === monthStartIso.slice(0, 7)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <span className="text-lg font-medium text-muted">{monthLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-md border border-border text-sm font-medium">
            <Link href={weekHref} className="px-3 py-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
              {t('viewWeek')}
            </Link>
            <span className="bg-accent px-3 py-1.5 text-accent-foreground">{t('viewMonth')}</span>
            <Link href={overviewHref} className="px-3 py-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
              {t('viewOverview')}
            </Link>
          </div>
          <Link href={prevHref} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">
            ←
          </Link>
          <Link href={currentHref} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">
            {t('currentWeek')}
          </Link>
          <Link href={nextHref} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">
            →
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="w-12 px-2 py-2 font-medium">KW</th>
              {weeks[0].map((d) => (
                <th key={d} className="px-2 py-2 font-medium">
                  {weekdayFmt.format(utcDate(d))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]} className="border-b border-border last:border-b-0">
                <td className="px-2 py-2 align-top">
                  <Link
                    href={`/schedule?week=${week[0]}`}
                    className="font-semibold text-accent hover:underline"
                  >
                    {isoWeek(utcDate(week[0]))}
                  </Link>
                </td>
                {week.map((day) => {
                  const dayEntries = byDay.get(day) ?? []
                  const extra = dayEntries.length - MAX_PER_DAY
                  return (
                    <td
                      key={day}
                      className={`h-24 border-l border-border px-1.5 py-1.5 align-top ${
                        inMonth(day) ? '' : 'bg-surface-hover/50 text-muted'
                      } ${day === todayIso ? 'bg-accent/5' : ''}`}
                    >
                      <Link
                        href={`/schedule?week=${week[0]}`}
                        className={`mb-1 inline-block rounded px-1 text-[11px] font-semibold tabular-nums ${
                          day === todayIso ? 'bg-accent text-accent-foreground' : ''
                        }`}
                      >
                        {Number(day.slice(8, 10))}
                      </Link>
                      <div className="space-y-0.5">
                        {dayEntries.slice(0, MAX_PER_DAY).map((e) => (
                          <div
                            key={e.id}
                            title={[e.projectName, e.time, e.vehicles].filter(Boolean).join(' · ')}
                            className={`truncate rounded px-1 py-0.5 ${
                              e.hasConflict
                                ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                : 'bg-accent/10 text-foreground'
                            }`}
                          >
                            {e.hasConflict && '⚠ '}
                            {e.projectName}
                          </div>
                        ))}
                        {extra > 0 && (
                          <Link
                            href={`/schedule?week=${week[0]}`}
                            className="block px-1 text-[11px] text-muted hover:text-foreground"
                          >
                            +{extra}
                          </Link>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
