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

  /** The share as a ring — the period's booked time against what the crew had. */
  const ring = (value: number) => {
    const r = 18
    const c = 2 * Math.PI * r
    const share = Math.max(0, Math.min(100, value)) / 100
    const color = value < 50 ? 'stroke-amber-500' : value > 90 ? 'stroke-emerald-600' : 'stroke-accent'
    return (
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="shrink-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" className="stroke-subtle" />
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * share} ${c}`} className={color} />
      </svg>
    )
  }

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
            <div className="flex items-center gap-3">
              {ring(pct)}
              <p className="text-xs text-muted">
                <span className={`text-base font-semibold tabular-nums ${tone(pct)}`}>{pct} %</span>{' '}
                {t('usagePersonDaysOf', { booked, available })}
              </p>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted">{t('usageBarsHint')}</p>
        {/* The months as bars: how much of the crew's time each one holds. */}
        <div className="overflow-x-auto">
          <ol className="grid h-36 min-w-[40rem] grid-cols-12 gap-1.5 border-b border-border">
            {months.map((m, month) => {
              const empty = m.booked === 0
              // Nothing planned yet is news for this month and the next; further out the schedule is simply not written.
              const soon = runningMonth >= 0 && (month === runningMonth || month === runningMonth + 1)
              const share = Math.min(100, m.pct ?? 0)
              return (
                <li
                  key={month}
                  title={empty ? t('usageNoBookings') : t('usageDaysOf', { booked: m.booked, available: m.available })}
                  className={`flex min-h-0 flex-col items-center justify-end gap-1 text-center ${inRange(month) ? '' : 'opacity-40'}`}
                >
                  <span className={`text-[11px] font-semibold tabular-nums ${empty ? (soon ? warn : 'text-muted') : tone(m.pct)}`}>
                    {empty ? '–' : `${m.pct} %`}
                  </span>
                  <span
                    className={`w-full max-w-10 rounded-t-sm ${
                      empty
                        ? 'border border-dashed border-border'
                        : share < 50
                          ? 'bg-amber-500/70'
                          : share > 90
                            ? 'bg-emerald-600/70'
                            : 'bg-accent/70'
                    } ${month === runningMonth ? 'ring-2 ring-accent/40' : ''}`}
                    style={{ height: `${Math.max(4, share * 0.8)}%` }}
                  />
                </li>
              )
            })}
          </ol>
          <ol className="grid min-w-[40rem] grid-cols-12 gap-1.5 pt-1 text-center text-[11px]">
            {months.map((m, month) => (
              <li key={month} className={month === runningMonth ? 'font-semibold text-accent' : 'text-muted'}>
                {monthNames.short[month]}
              </li>
            ))}
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
