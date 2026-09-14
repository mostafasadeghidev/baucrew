/**
 * The CRM's Auslastung tab: is the crew planned, and who and what stands idle.
 * How long the finished jobs took against their plan is in the Excel export.
 *
 * Every figure follows the year and period in the page bar. The shares count
 * the schedule the way the crew lives it — one booking a weekday at most, never
 * on a day away — and a month nobody has planned yet is named as such instead
 * of pulling every share down to a number that only measures missing entries.
 */

import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CrewMonth } from '@/lib/order-situation'
import type { NamedUsage } from '@/lib/reports'
import type { MonthRange } from '@/lib/reports-calc'

const card = 'rounded-xl border border-border bg-surface shadow-sm'
const up = 'text-emerald-700 dark:text-emerald-400'
const warn = 'text-amber-700 dark:text-amber-400'

export async function UsageView({
  year,
  range,
  runningMonth,
  months,
  covered,
  people,
  vehicles,
  monthNames,
  frameLabel,
}: {
  year: number
  range: MonthRange | null
  /** The month (0–11) running today, or −1 in another year. */
  runningMonth: number
  months: CrewMonth[]
  /** The months of the period that have any booking. */
  covered: number[]
  people: NamedUsage[]
  vehicles: NamedUsage[]
  monthNames: { long: string[]; short: string[] }
  /** "3. Quartal 2026", "2026". */
  frameLabel: string
}) {
  const t = await getTranslations('reports')
  const inRange = (month: number) => !range || (month >= range.from && month <= range.to)
  const tone = (pct: number | null) => (pct === null ? 'text-muted' : pct < 50 ? warn : pct > 90 ? up : '')

  // The header sums only the months that have bookings, and names them.
  const counted = covered.filter(inRange)
  const booked = counted.reduce((sum, m) => sum + months[m].booked, 0)
  const available = counted.reduce((sum, m) => sum + months[m].available, 0)
  const pct = available > 0 ? Math.round((booked / available) * 100) : null
  const countedLabel =
    counted.length === 0
      ? null
      : counted.length === 1
        ? monthNames.long[counted[0]]
        : counted.every((m, i) => i === 0 || m === counted[i - 1] + 1)
          ? `${monthNames.short[counted[0]]}–${monthNames.short[counted[counted.length - 1]]}`
          : counted.map((m) => monthNames.short[m]).join(', ')

  const usageList = (title: string, rows: NamedUsage[], href: string, unit: 'people' | 'vehicles') => (
    <section className={`overflow-hidden ${card}`}>
      <div className="border-b border-border px-3 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-[11px] text-muted">{t(unit === 'people' ? 'usagePeopleHint' : 'usageVehiclesHint')}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-sm text-muted">{t('noUsage')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-[minmax(0,160px)_1fr_auto_auto] items-center gap-3 px-3 py-1.5 text-[13px]"
            >
              <Link href={`${href}/${row.id}`} className="truncate text-accent hover:underline">
                {row.name || '—'}
              </Link>
              <div className="h-2 rounded-sm bg-surface-hover">
                <div
                  className={`h-2 rounded-sm ${row.pct !== null && row.pct < 50 ? 'bg-amber-500/70' : 'bg-accent/70'}`}
                  style={{ width: `${Math.min(100, row.pct ?? 0)}%` }}
                />
              </div>
              <span className={`w-12 text-right font-semibold tabular-nums ${tone(row.pct)}`}>
                {row.pct === null ? '—' : `${row.pct} %`}
              </span>
              <span className="w-28 text-right text-[11px] tabular-nums text-muted">
                {t('usageDaysOf', { booked: row.booked, available: row.available })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  return (
    <section className="space-y-4">
      <div className={`${card} space-y-3 p-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {countedLabel ? t('usageHeader', { months: `${countedLabel} ${year}` }) : t('usageHeaderNone', { frame: frameLabel })}
          </h2>
          {pct !== null && (
            <p className="text-xs text-muted">
              <span className={`text-base font-semibold tabular-nums ${tone(pct)}`}>{pct} %</span>{' '}
              {t('usagePersonDaysOf', { booked, available })}
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <ol className="grid min-w-[46rem] grid-cols-12 gap-1">
            {months.map((m, month) => {
              const empty = m.booked === 0
              // Nothing planned yet is news for this month and the next; further out the schedule is simply not written.
              const soon = runningMonth >= 0 && (month === runningMonth || month === runningMonth + 1)
              return (
                <li
                  key={month}
                  className={`rounded-lg border border-border px-1.5 py-1.5 text-center ${
                    inRange(month) ? '' : 'opacity-40'
                  } ${month === runningMonth ? 'bg-subtle' : ''}`}
                >
                  <span className={`block text-[11px] ${month === runningMonth ? 'font-semibold text-accent' : 'text-muted'}`}>
                    {monthNames.short[month]}
                  </span>
                  {empty ? (
                    <span className={`block text-[10px] leading-tight ${soon ? warn : 'text-muted'}`}>
                      {t('usageNoBookings')}
                    </span>
                  ) : (
                    <>
                      <span className={`block text-sm font-semibold tabular-nums ${tone(m.pct)}`}>
                        {m.pct === null ? '—' : `${m.pct} %`}
                      </span>
                      <span className="block text-[10px] tabular-nums text-muted">
                        {m.booked}/{m.available}
                      </span>
                    </>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {usageList(t('workloadTitle'), people, '/employees', 'people')}
        {usageList(t('vehicleUsageTitle'), vehicles, '/vehicles', 'vehicles')}
      </div>
    </section>
  )
}
