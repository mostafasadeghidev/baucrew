import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { entryMinutes, formatMinutes, sumMinutes, type TimeInterval } from '@/lib/time-entries'

export type ProjectTimeRow = TimeInterval & {
  id: string
  source: string
  note: string | null
  employee: { id: string; firstName: string; lastName: string }
}

/**
 * Hours booked on this project — the figure the office looks at while the job
 * is still running ("are we still inside the calculation?"). Money stays out
 * unless the account may see it.
 */
export async function ProjectTimeSummary({
  entries,
  orderValue,
  showPrice,
}: {
  entries: ProjectTimeRow[]
  /** Order value including follow-on offers; null when there is none. */
  orderValue: number | null
  showPrice: boolean
}) {
  const [t, locale] = await Promise.all([getTranslations('time'), getLocale()])
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'
  const dayFmt = new Intl.DateTimeFormat(intl, { weekday: 'short', day: '2-digit', month: '2-digit' })
  const timeFmt = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit' })
  const now = new Date()
  const total = sumMinutes(entries, now)

  // Per person, most hours first.
  const perEmployee = new Map<string, { name: string; minutes: number }>()
  for (const entry of entries) {
    const key = entry.employee.id
    const name = `${entry.employee.firstName} ${entry.employee.lastName}`.trim()
    const current = perEmployee.get(key)
    const minutes = entryMinutes(entry, now)
    if (current) current.minutes += minutes
    else perEmployee.set(key, { name, minutes })
  }
  const people = [...perEmployee.values()].sort((a, b) => b.minutes - a.minutes)
  const perHour = showPrice && orderValue != null && total >= 30 ? orderValue / (total / 60) : null

  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{t('projectTitle')}</h2>
        {entries.length > 0 && (
          <span className="text-sm tabular-nums">
            <span className="font-semibold">{formatMinutes(total)}</span>{' '}
            <span className="text-muted">{t('hoursShort')}</span>
            {perHour != null && (
              <span className="ml-2 text-muted">
                · {t('perHour', { value: new Intl.NumberFormat(intl, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(perHour) })}
              </span>
            )}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">{t('projectNone')}</p>
      ) : (
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t('perEmployee')}
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {people.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 tabular-nums font-medium">{formatMinutes(p.minutes)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t('lastBookings')}
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {entries.slice(0, 6).map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="w-20 shrink-0 text-muted">{dayFmt.format(entry.startedAt)}</span>
                  <span className="shrink-0 tabular-nums">
                    {timeFmt.format(entry.startedAt)}–
                    {entry.endedAt ? timeFmt.format(entry.endedAt) : '…'}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {entry.endedAt ? formatMinutes(entryMinutes(entry, now)) : t('running')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {`${entry.employee.firstName} ${entry.employee.lastName}`.trim()}
                  </span>
                </li>
              ))}
            </ul>
            {entries.length > 6 && (
              <p className="mt-1 text-xs text-muted">+{entries.length - 6}</p>
            )}
          </div>
        </div>
      )}

      <p className="border-t border-border px-5 py-2 text-xs text-muted">
        {t('projectHint')}{' '}
        <Link href="/reports?tab=projects" className="text-accent hover:underline">
          {t('projectReportLink')}
        </Link>
      </p>
    </section>
  )
}
