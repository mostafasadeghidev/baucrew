/**
 * The CRM's Auslastung tab: is the crew planned, who and what stands idle, and
 * how long the finished jobs took against their plan.
 *
 * Every figure follows the year and period in the page bar. The shares count
 * the schedule the way the crew lives it — one booking a weekday at most, never
 * on a day away — and a month nobody has planned yet is named as such instead
 * of pulling every share down to a number that only measures missing entries.
 */

import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { formatCurrency } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import { formatMinutes } from '@/lib/time-entries'
import type { CrewMonth } from '@/lib/order-situation'
import type { EfficiencyRow, NamedUsage } from '@/lib/reports'
import type { MonthRange } from '@/lib/reports-calc'

const card = 'rounded-xl border border-border bg-surface shadow-sm'
const th = 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted'
const thR = `${th} text-right`
const td = 'px-3 py-1.5'
const tdR = `${td} text-right tabular-nums`
const up = 'text-emerald-700 dark:text-emerald-400'
const down = 'text-red-700 dark:text-red-400'
const warn = 'text-amber-700 dark:text-amber-400'

type Efficiency = {
  rows: EfficiencyRow[]
  avg: { plannedDays: number | null; actualDays: number | null; revenuePerPersonDay: number | null; delayDays: number | null }
  hiddenHistorical: number
  undated: number
}

export async function UsageView({
  year,
  range,
  runningMonth,
  months,
  covered,
  people,
  vehicles,
  efficiency,
  showFinancials,
  locale,
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
  efficiency: Efficiency
  showFinancials: boolean
  locale: string
  monthNames: { long: string[]; short: string[] }
  /** "3. Quartal 2026", "2026". */
  frameLabel: string
}) {
  const t = await getTranslations('reports')
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'
  const hidePrices = await pricesHidden()
  const money = (v: number | null) => formatCurrency(v, locale, { hidden: hidePrices })
  const fmtNum = (n: number | null) => (n == null ? '—' : n.toLocaleString(intl, { maximumFractionDigits: 1 }))
  const fmtDelay = (d: number | null) =>
    d == null ? '—' : d === 0 ? t('onTime') : `${d > 0 ? '+' : ''}${t('daysShort', { count: fmtNum(d) })}`
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
  const hasHours = efficiency.rows.some((r) => r.recordedMinutes >= 30)

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

      <section id="plan-ist" className={`scroll-mt-40 overflow-hidden ${card}`}>
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="text-sm font-semibold">{t('efficiencyTitle')}</h2>
          <p className="mt-0.5 text-[11px] text-muted">{t('efficiencyHint')}</p>
        </div>
        {efficiency.rows.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted">{t('noEfficiency')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full table-fixed text-[13px] ${showFinancials ? 'min-w-[820px]' : 'min-w-[700px]'}`}>
              <colgroup>
                <col />
                <col className="w-20" />
                <col className="w-20" />
                <col className="w-28" />
                {hasHours && <col className="w-24" />}
                {showFinancials && <col className="w-28" />}
                {showFinancials && hasHours && <col className="w-24" />}
                <col className="w-24" />
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  <th className={th}>{t('colProject')}</th>
                  <th className={thR}>{t('colPlannedDays')}</th>
                  <th className={thR}>{t('colActualDays')}</th>
                  <th className={thR}>{t('colPersonDays')}</th>
                  {hasHours && <th className={thR}>{t('colRecordedHours')}</th>}
                  {showFinancials && <th className={thR}>{t('colPerPersonDay')}</th>}
                  {showFinancials && hasHours && <th className={thR}>{t('colPerHour')}</th>}
                  <th className={thR}>{t('colDelay')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {efficiency.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-hover">
                    <td className={`max-w-[320px] ${td}`}>
                      <Link href={`/projects/${r.id}`} className="block break-words text-accent hover:underline">
                        {r.number} — {r.name}
                      </Link>
                      <span className="block break-words text-[11px] text-muted">{r.customer}</span>
                    </td>
                    <td className={tdR}>{r.plannedDays ?? '—'}</td>
                    <td className={`${tdR} ${r.dayDelta != null && r.dayDelta > 0 ? down : ''}`}>{r.actualDays || '—'}</td>
                    <td className={tdR}>{r.personDays || '—'}</td>
                    {hasHours && (
                      <td className={tdR}>{r.recordedMinutes >= 30 ? formatMinutes(r.recordedMinutes) : '—'}</td>
                    )}
                    {showFinancials && (
                      <td className={`${tdR} font-medium`}>
                        {r.revenuePerPersonDay != null ? money(r.revenuePerPersonDay) : '—'}
                      </td>
                    )}
                    {showFinancials && hasHours && (
                      <td className={`${tdR} font-medium`}>{r.revenuePerHour != null ? money(r.revenuePerHour) : '—'}</td>
                    )}
                    <td className={`${tdR} ${r.delayDays == null ? 'text-muted' : r.delayDays > 0 ? down : up}`}>
                      {fmtDelay(r.delayDays)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface-hover font-medium">
                  <td className={td}>{t('avgRowFrame', { frame: frameLabel })}</td>
                  <td className={tdR}>{fmtNum(efficiency.avg.plannedDays)}</td>
                  <td className={tdR}>{fmtNum(efficiency.avg.actualDays)}</td>
                  <td className={td} />
                  {hasHours && <td className={td} />}
                  {showFinancials && (
                    <td className={tdR}>
                      {efficiency.avg.revenuePerPersonDay != null ? money(efficiency.avg.revenuePerPersonDay) : '—'}
                    </td>
                  )}
                  {showFinancials && hasHours && <td className={td} />}
                  <td className={tdR}>{fmtDelay(efficiency.avg.delayDays)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {(efficiency.hiddenHistorical > 0 || efficiency.undated > 0) && (
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
            {[
              efficiency.hiddenHistorical > 0 ? t('efficiencyHistorical', { count: efficiency.hiddenHistorical }) : null,
              efficiency.undated > 0 ? t('efficiencyUndated', { count: efficiency.undated }) : null,
            ]
              .filter(Boolean)
              .join(' ')}
          </p>
        )}
      </section>
    </section>
  )
}
