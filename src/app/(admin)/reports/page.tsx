import Link from 'next/link'
import { CalendarRange } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import {
  STALE_OFFER_DAYS,
  getCustomerReport,
  getDataQuality,
  getOpenOffers,
  getPipeline,
  getProjectEfficiency,
  getYearRevenueOrHistory,
  getYearPlan,
  getPlanGaps,
  getYearUsage,
} from '@/lib/reports'
import {
  parsePeriod,
  percentChange,
  sumRange,
  utilizationLevel,
  workingDaysInPeriod,
  type MonthRange,
} from '@/lib/reports-calc'
import { formatCurrency, formatDate } from '@/lib/format'
import { db } from '@/lib/db'
import { StatusBadge } from '@/components/status-badge'
import { RevenueChart } from '@/components/revenue-chart'
import { ParamTabs } from '@/components/param-tabs'
import { LiveSelect } from '@/components/live-search'
import { PrintButton } from '@/components/print-button'
import { ProjectStatus } from '@/generated/prisma/enums'
import { btn } from '@/components/ui/button'
import { DonutChart } from '@/components/donut-chart'
import { formatMinutes } from '@/lib/time-entries'

const TABS = ['overview', 'revenue', 'offers', 'projects', 'customers', 'utilization', 'quality'] as const
type Tab = (typeof TABS)[number]

const card = 'rounded-lg border border-border bg-surface shadow-sm'
const kpi = 'rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm'
const kpiLabel = 'text-[11px] uppercase tracking-wide text-muted'
const kpiValue = 'mt-0.5 text-lg font-semibold tabular-nums'
const kpiSub = 'mt-0.5 text-[11px]'
const th = 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted'
const thR = `${th} text-right`
const td = 'px-3 py-1.5'
const tdR = `${td} text-right tabular-nums`
const up = 'text-emerald-700 dark:text-emerald-400'
const down = 'text-red-700 dark:text-red-400'
const warn = 'text-amber-700 dark:text-amber-400'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; period?: string; tab?: string }>
}) {
  const user = await requireManagement()
  const { year: yearParam, period: periodParam, tab: tabParam } = await searchParams
  const [t, tProjects, locale] = await Promise.all([
    getTranslations('reports'),
    getTranslations('projects'),
    getLocale(),
  ])
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'

  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : currentYear
  const range: MonthRange | null = parsePeriod(periodParam)
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'overview'
  const showFinancials = canViewFinancials(user)

  const [revenue, prevRevenue, plan, planGaps, pipeline, openOffers, efficiency, usage, statusCounts, customers, quality] = await Promise.all([
    showFinancials ? getYearRevenueOrHistory(year) : null,
    showFinancials ? getYearRevenueOrHistory(year - 1) : null,
    showFinancials ? getYearPlan(year) : null,
    showFinancials ? getPlanGaps(year) : null,
    showFinancials ? getPipeline() : null,
    showFinancials ? getOpenOffers() : null,
    getProjectEfficiency(year, range),
    getYearUsage(year, range),
    db.project.groupBy({ by: ['status'], _count: { _all: true } }),
    showFinancials ? getCustomerReport(year, range) : null,
    getDataQuality(),
  ])

  // ── Formatting helpers ───────────────────────────────────
  const monthFmt = new Intl.DateTimeFormat(intl, { month: 'long', timeZone: 'UTC' })
  const shortMonthFmt = new Intl.DateTimeFormat(intl, { month: 'short', timeZone: 'UTC' })
  const monthName = (m: number) => monthFmt.format(new Date(Date.UTC(year, m, 1)))
  const shortMonths = Array.from({ length: 12 }, (_, m) => shortMonthFmt.format(new Date(Date.UTC(year, m, 1))))
  const fmtNum = (n: number | null) => (n == null ? '—' : n.toLocaleString(intl, { maximumFractionDigits: 1 }))
  const fmtDelay = (d: number | null) =>
    d == null ? '—' : d === 0 ? t('onTime') : `${d > 0 ? '+' : ''}${t('daysShort', { count: d })}`
  const money = (v: number | null | undefined) => formatCurrency(v, locale)

  // Revenue per quarter, as a ring instead of another table.
  const quarters = (revenue?.months ?? []).reduce<Array<{ label: string; value: number; hint?: string }>>(
    (acc, m) => {
      const q = Math.floor(m.month / 3)
      acc[q].value += m.total
      return acc
    },
    [0, 1, 2, 3].map((q) => ({ label: `Q${q + 1}`, value: 0, hint: `${q * 3 + 1}–${q * 3 + 3}` }))
  )

  /** Human label of the selected period ("August", "3. Quartal", "1. Halbjahr"). */
  const periodLabel = (() => {
    if (!range) return null
    const len = range.to - range.from + 1
    if (len === 1) return monthName(range.from)
    if (len === 3) return t('periodQuarter', { n: range.from / 3 + 1 })
    if (len === 6) return t('periodHalf', { n: range.from / 6 + 1 })
    return `${shortMonths[range.from]}–${shortMonths[range.to]}`
  })()

  // ── KPI: revenue for the period vs. same period of the previous year ──
  // Whole year on the current year = "year to date" (Jan..current month).
  const effectiveRange: MonthRange | null =
    range ?? (year === currentYear ? { from: 0, to: now.getUTCMonth() } : null)
  const cur = revenue ? sumRange(revenue.months.map((m) => m.total), effectiveRange) : 0
  const prev = prevRevenue ? sumRange(prevRevenue.months.map((m) => m.total), effectiveRange) : 0
  const sub = revenue ? sumRange(revenue.months.map((m) => m.subTotal), effectiveRange) : 0
  const change = percentChange(cur, prev)
  const subShare = cur > 0 ? Math.round((sub / cur) * 100) : null
  const kpiTitle = periodLabel
    ? t('kpiPeriod', { period: periodLabel, year })
    : effectiveRange && effectiveRange.to < 11
      ? t('kpiYtd', { year, month: monthName(effectiveRange.to) })
      : t('kpiYtdFull', { year })
  const compareLabel = periodLabel
    ? t('vsPrevPeriod', { period: periodLabel, year: year - 1 })
    : t('vsPrevYear', { year: year - 1 })

  const hasPlan = plan?.hasPlan ?? false
  // A year the company ran before BauCrew stands on the sheet's own figures.
  // Holding the sheet against itself would only ever show a difference of
  // zero, so the comparison is left out and the source is named instead.
  const fromSheet = revenue?.fromSheet ?? false
  const planComparable = hasPlan && !fromSheet
  const visibleMonths = revenue
    ? revenue.months.filter(
        (m) =>
          (!range || (m.month >= range.from && m.month <= range.to)) &&
          (m.own.length > 0 || m.sub.length > 0 || (plan?.months[m.month].total ?? 0) > 0)
      )
    : []
  const periodRevenueTotal = revenue ? sumRange(revenue.months.map((m) => m.total), range) : 0
  // The planned figures from the office's own year sheet, same period.
  const periodPlanTotal = plan ? sumRange(plan.months.map((m) => m.total), range) : 0
  /** Actual against plan: green once the plan is reached, amber below it. */
  const planDelta = (actual: number, planned: number) => {
    const diff = actual - planned
    const tone = diff >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
    const percent = planned > 0 ? Math.round((diff / planned) * 100) : null
    return { diff, tone, percent, label: `${diff >= 0 ? '+' : '−'}${money(Math.abs(diff))}` }
  }
  const statusOrder = Object.keys(ProjectStatus) as ProjectStatus[]
  const countByStatus = new Map(statusCounts.map((s) => [s.status, s._count._all]))
  const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear + 1 - i))
  const workingDays = workingDaysInPeriod(year, range, now)
  const qualityCount = quality.reduce((a, q) => a + q.count, 0)
  const topCustomer = customers?.top[0]
  const exportHref = `/reports/export?year=${year}${periodParam ? `&period=${encodeURIComponent(periodParam)}` : ''}`

  // Grouped, so quarters, half-years and months are not one long flat list.
  const periodOptions = [
    {
      label: t('groupQuarters'),
      options: [1, 2, 3, 4].map((n) => ({
        value: `q${n}`,
        label: `${t('periodQuarter', { n })} (${shortMonths[(n - 1) * 3]}–${shortMonths[(n - 1) * 3 + 2]})`,
      })),
    },
    {
      label: t('groupHalves'),
      options: [1, 2].map((n) => ({
        value: `h${n}`,
        label: `${t('periodHalf', { n })} (${shortMonths[(n - 1) * 6]}–${shortMonths[(n - 1) * 6 + 5]})`,
      })),
    },
    {
      label: t('groupMonths'),
      options: Array.from({ length: 12 }, (_, m) => ({ value: String(m + 1), label: monthName(m) })),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Header + period controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('title')}
          <span className="ml-2 hidden text-base font-normal text-muted print:inline">
            {periodLabel ? `${periodLabel} ${year}` : year}
          </span>
        </h1>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {/* Year and period belong together, so they sit in one small bar. */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-subtle px-2 py-1">
            <CalendarRange className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            {/* The current year keeps its place in the list; its value is empty
                because "no year in the URL" means the current year. */}
            <LiveSelect
              param="year"
              ariaLabel={t('year')}
              className="min-w-20"
              compact
              options={yearOptions.map((y) => ({ value: y === String(currentYear) ? '' : y, label: y }))}
            />
            <LiveSelect
              param="period"
              ariaLabel={t('period')}
              allLabel={t('allMonths')}
              className="min-w-40"
              compact
              options={periodOptions}
            />
          </div>
          <PrintButton label={t('print')} />
          {showFinancials && (
            <a
              href={exportHref}
              className={btn.outlineSm}
            >
              {t('exportExcel')}
            </a>
          )}
        </div>
      </div>

      <div className="print:hidden">
        <ParamTabs
          ariaLabel={t('title')}
          tabs={[
            { value: '', label: t('tabOverview') },
            { value: 'revenue', label: t('tabRevenue') },
            { value: 'projects', label: t('tabProjects'), count: efficiency.rows.length },
            { value: 'offers', label: t('tabOffers'), count: openOffers?.offers.length },
            { value: 'customers', label: t('tabCustomers') },
            { value: 'utilization', label: t('tabUtilization') },
            { value: 'quality', label: t('tabQuality'), count: qualityCount },
          ]}
        />
      </div>

      {/* ── Overview ─────────────────────────────────────── */}
      {tab === 'overview' &&
        (!revenue ? (
          <p className={`${card} p-6 text-sm text-muted`}>{t('noAccess')}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className={kpi}>
                <p className={kpiLabel}>{kpiTitle}</p>
                <p className={kpiValue}>{money(cur)}</p>
                <p className={`${kpiSub} ${change == null ? 'text-muted' : change >= 0 ? up : down}`}>
                  {change == null ? t('noPrevYear') : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)} % ${compareLabel}`}
                </p>
              </div>
              <div className={kpi}>
                <p className={kpiLabel}>{t('kpiSubShare')}</p>
                <p className={kpiValue}>{money(sub)}</p>
                <p className={`${kpiSub} text-muted`}>{subShare == null ? '—' : `${subShare} % ${t('share')}`}</p>
              </div>
              <div className={`${kpi} col-span-2`}>
                <div className="flex items-baseline justify-between">
                  <p className={kpiLabel}>{t('openOrders')}</p>
                  <p className="text-[11px] text-muted">{t('openOrdersHint')}</p>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {pipeline?.map((b) => (
                    <div key={b.key}>
                      <p className="text-[11px] text-muted">
                        {b.key === 'offers'
                          ? t('kpiOffers')
                          : b.key === 'ordered'
                            ? t('kpiOrdered')
                            : b.key === 'inProgress'
                              ? t('kpiInProgress')
                              : t('kpiPlanned')}
                      </p>
                      <p className="text-base font-semibold tabular-nums">{money(b.total)}</p>
                      <p className="text-[11px] text-muted">{t('projectsCount', { count: b.count })}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className={`${card} p-4`}>
              <h2 className="mb-2 text-sm font-semibold">{t('chartTitle', { year, prev: year - 1 })}</h2>
              <RevenueChart
                months={revenue.months.map((m, i) => ({
                  own: m.ownTotal,
                  sub: m.subTotal,
                  prev: prevRevenue ? prevRevenue.months[i].total : null,
                  plan: hasPlan ? plan!.months[i].total : null,
                }))}
                labels={shortMonths}
                legend={{
                  own: t('legendOwn', { year }),
                  sub: t('legendSub', { year }),
                  prev: t('legendPrev', { year: year - 1 }),
                  plan: t('legendPlan'),
                }}
                formatValue={money}
                highlightRange={range}
              />
            </div>

              <div className={`${card} p-4`}>
                <h2 className="mb-3 text-sm font-semibold">{t('quarterTitle', { year })}</h2>
                <DonutChart
                  slices={quarters}
                  centerLabel={t('yearTotal')}
                  centerValue={money(revenue.yearTotal)}
                  formatValue={(v) => money(v)}
                />
              </div>
            </div>

            {qualityCount > 0 && (
              <Link
                href={`/reports?tab=quality&year=${year}${periodParam ? `&period=${periodParam}` : ''}`}
                className={`flex items-center justify-between ${card} px-3 py-2 text-[13px] hover:bg-surface-hover print:hidden`}
              >
                <span className={warn}>⚠ {t('qualityTitle')}</span>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-700 dark:text-amber-400">
                  {qualityCount}
                </span>
              </Link>
            )}
          </div>
        ))}

      {/* ── Revenue (Monatsplanumsatz) ───────────────────── */}
      {tab === 'revenue' &&
        (!revenue ? (
          <p className={`${card} p-6 text-sm text-muted`}>{t('noAccess')}</p>
        ) : (
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">{t('revenueTitle')}</h2>
              <p className="text-xs text-muted">
                {periodLabel ?? t('yearTotal')}:{' '}
                <span className="font-semibold text-foreground tabular-nums">{money(periodRevenueTotal)}</span>
                {hasPlan && !fromSheet && (
                  <>
                    {' · '}
                    {t('planned')}:{' '}
                    <span className="tabular-nums">{money(periodPlanTotal)}</span>
                    {planComparable && (
                      <>
                        {' '}
                        <span className={`font-medium tabular-nums ${planDelta(periodRevenueTotal, periodPlanTotal).tone}`}>
                          {planDelta(periodRevenueTotal, periodPlanTotal).label}
                        </span>
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
            {fromSheet && (
              <p className="rounded-md border border-border bg-subtle px-3 py-2 text-xs text-muted">
                {t('fromSheetYear', { year })}
              </p>
            )}
            {/* Sites the sheet parks on the year without picking a month yet —
                they belong to no month card, so they get their own line. */}
            {hasPlan && !range && plan!.open > 0 && (
              <p className="text-xs text-muted">
                {t('planWithoutMonth', { amount: money(plan!.open) })}
              </p>
            )}
            {visibleMonths.length === 0 ? (
              <p className={`${card} p-6 text-sm text-muted`}>{t('noRevenueInPeriod')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleMonths.map((m) => (
                  <div key={m.month} className={`flex flex-col ${card}`}>
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <h3 className="text-sm font-semibold">{monthName(m.month)}</h3>
                      <span className="text-sm font-semibold tabular-nums">{money(m.total)}</span>
                    </div>
                    <div className="flex-1 px-3 py-1.5 text-[13px]">
                      {m.own.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 py-0.5">
                          {p.fromSheet ? (
                            <span className="truncate">{p.name}</span>
                          ) : (
                            <Link href={`/projects/${p.id}`} className="truncate text-accent hover:underline">
                              {p.name}
                            </Link>
                          )}
                          <span className="shrink-0 tabular-nums text-muted">{money(p.price)}</span>
                        </div>
                      ))}
                      <div className="mt-1 flex items-center justify-between border-t border-border pt-1 font-medium">
                        <span className="italic">{t('ownPeople')}</span>
                        <span className="tabular-nums">{money(m.ownTotal)}</span>
                      </div>
                      {m.sub.length > 0 && (
                        <>
                          <div className="mt-1.5">
                            {m.sub.map((p) => (
                              <div key={p.id} className="flex items-center justify-between gap-2 py-0.5">
                                {p.fromSheet ? (
                                  <span className="truncate">{p.name}</span>
                                ) : (
                                  <Link href={`/projects/${p.id}`} className="truncate text-accent hover:underline">
                                    {p.name}
                                  </Link>
                                )}
                                <span className="shrink-0 tabular-nums text-muted">{money(p.price)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-1 flex items-center justify-between border-t border-border pt-1 font-medium">
                            <span className="italic">{t('sub')}</span>
                            <span className="tabular-nums">{money(m.subTotal)}</span>
                          </div>
                        </>
                      )}
                      {hasPlan && !fromSheet && (
                        <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1 text-xs">
                          <span className="text-muted">{t('planned')}</span>
                          <span className="flex items-center gap-2 tabular-nums">
                            <span className="text-muted">{money(plan!.months[m.month].total)}</span>
                            {planComparable && (
                              <span className={`font-medium ${planDelta(m.total, plan!.months[m.month].total).tone}`}>
                                {planDelta(m.total, plan!.months[m.month].total).label}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Promised in the sheet, but no project carries it yet. */}
            {hasPlan && !fromSheet && planGaps && planGaps.rows.length > 0 && (
              <div className={`${card} p-4`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t('planGapsTitle')}</h3>
                  <p className="text-xs text-muted">
                    {t('planGapsSummary', { count: planGaps.rows.length })}{' '}
                    <span className="font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                      {money(planGaps.total)}
                    </span>
                  </p>
                </div>
                <ul className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                  {planGaps.rows.slice(0, 12).map((gap) => (
                    <li key={gap.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <span className="text-muted">
                          {gap.month ? shortMonths[gap.month - 1] : t('noMonthShort')}
                        </span>{' '}
                        {gap.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">{money(gap.amount)}</span>
                    </li>
                  ))}
                </ul>
                {planGaps.rows.length > 12 && (
                  <p className="mt-1 text-xs text-muted">
                    {t('planGapsMore', { count: planGaps.rows.length - 12 })}
                  </p>
                )}
                <Link
                  href={`/reports/plan?year=${year}`}
                  className="mt-3 inline-block text-sm text-accent hover:underline"
                >
                  {t('planGapsLink')} →
                </Link>
              </div>
            )}
          </section>
        ))}

      {/* ── Projects: plan vs. actual + status ───────────── */}
      {tab === 'projects' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <section className={`overflow-hidden ${card}`}>
            <div className="border-b border-border px-3 py-2.5">
              <h2 className="text-sm font-semibold">{t('efficiencyTitle')}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{t('efficiencyHint')}</p>
            </div>
            {efficiency.rows.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted">{t('noEfficiency')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={th}>{t('colProject')}</th>
                      <th className={thR}>{t('colPlannedDays')}</th>
                      <th className={thR}>{t('colActualDays')}</th>
                      <th className={thR}>{t('colPersonDays')}</th>
                      <th className={thR}>{t('colRecordedHours')}</th>
                      {showFinancials && <th className={thR}>{t('colPerPersonDay')}</th>}
                      {showFinancials && <th className={thR}>{t('colPerHour')}</th>}
                      <th className={thR}>{t('colDelay')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {efficiency.rows.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-hover">
                        <td className={`max-w-[320px] ${td}`}>
                          <Link href={`/projects/${r.id}`} className="block truncate text-accent hover:underline">
                            {r.number} — {r.name}
                          </Link>
                          <span className="block truncate text-[11px] text-muted">{r.customer}</span>
                        </td>
                        <td className={tdR}>{r.plannedDays ?? '—'}</td>
                        <td className={`${tdR} ${r.dayDelta != null && r.dayDelta > 0 ? down : ''}`}>{r.actualDays || '—'}</td>
                        <td className={tdR}>{r.personDays || '—'}</td>
                        <td className={tdR}>
                          {r.recordedMinutes >= 30 ? formatMinutes(r.recordedMinutes) : '—'}
                        </td>
                        {showFinancials && (
                          <td className={`${tdR} font-medium`}>
                            {r.revenuePerPersonDay != null ? money(r.revenuePerPersonDay) : '—'}
                          </td>
                        )}
                        {showFinancials && (
                          <td className={`${tdR} font-medium`}>
                            {r.revenuePerHour != null ? money(r.revenuePerHour) : '—'}
                          </td>
                        )}
                        <td className={`${tdR} ${r.delayDays == null ? 'text-muted' : r.delayDays > 0 ? down : up}`}>
                          {fmtDelay(r.delayDays)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-surface-hover font-medium">
                      <td className={td}>{t('avgRow', { year })}</td>
                      <td className={tdR}>{fmtNum(efficiency.avg.plannedDays)}</td>
                      <td className={tdR}>{fmtNum(efficiency.avg.actualDays)}</td>
                      <td className={td} />
                      <td className={td} />
                      {showFinancials && (
                        <td className={tdR}>
                          {efficiency.avg.revenuePerPersonDay != null ? money(efficiency.avg.revenuePerPersonDay) : '—'}
                        </td>
                      )}
                      {showFinancials && <td className={td} />}
                      <td className={tdR}>{fmtDelay(efficiency.avg.delayDays)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <section className={`overflow-hidden self-start ${card}`}>
            <h2 className="border-b border-border px-3 py-2.5 text-sm font-semibold">{t('statusTitle')}</h2>
            <ul className="divide-y divide-border">
              {statusOrder
                .filter((s) => (countByStatus.get(s) ?? 0) > 0)
                .map((s) => (
                  <li key={s} className="flex items-center justify-between px-3 py-1.5 text-[13px]">
                    <StatusBadge status={s} />
                    <span className="font-semibold tabular-nums">{countByStatus.get(s)}</span>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      )}

      {/* ── Customers ────────────────────────────────────── */}
      {tab === 'offers' &&
        (!openOffers ? (
          <p className={`${card} p-6 text-sm text-muted`}>{t('noAccess')}</p>
        ) : (
          <section className={`overflow-hidden ${card}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-3 py-2.5">
              <div>
                <h2 className="text-sm font-semibold">{t('offersTitle')}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t('offersHint', { days: STALE_OFFER_DAYS })}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold tabular-nums">{money(openOffers.total)}</p>
                <p className="text-[11px] text-muted">
                  {t('projectsCount', { count: openOffers.offers.length })}
                  {openOffers.staleCount > 0 && (
                    <span className={`ml-2 ${warn}`}>{'\⚠'} {t('offersStale', { count: openOffers.staleCount })}</span>
                  )}
                </p>
              </div>
            </div>
            {openOffers.offers.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted">{t('offersNone')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                      <th className="px-3 py-2 font-medium">{tProjects('number')}</th>
                      <th className="px-3 py-2 font-medium">{tProjects('name')}</th>
                      <th className="px-3 py-2 font-medium">{tProjects('customer')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('offerAge')}</th>
                      <th className="px-3 py-2 text-right font-medium">{tProjects('price')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {openOffers.offers.map((o) => (
                      <tr key={o.id} className="hover:bg-surface-hover">
                        <td className="px-3 py-2 tabular-nums text-muted">{o.number}</td>
                        <td className="px-3 py-2">
                          <Link href={`/projects/${o.id}`} className="font-medium text-accent hover:underline">
                            {o.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-muted">{o.customer}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            o.ageDays >= STALE_OFFER_DAYS ? warn : 'text-muted'
                          }`}
                        >
                          {t('daysShort', { count: o.ageDays })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(o.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}

      {tab === 'customers' &&
        (!customers ? (
          <p className={`${card} p-6 text-sm text-muted`}>{t('noAccess')}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <section className={`overflow-hidden ${card}`}>
              <div className="border-b border-border px-3 py-2.5">
                <h2 className="text-sm font-semibold">{t('customersTitle')}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t('customersHint')}</p>
              </div>
              {customers.top.length === 0 ? (
                <p className="px-3 py-6 text-sm text-muted">{t('noCustomers')}</p>
              ) : (
                <>
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={th}>{t('colCustomer')}</th>
                        <th className={th}>{t('colShare')}</th>
                        <th className={thR}>{t('colProjects')}</th>
                        <th className={thR}>{t('colRevenue')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {customers.top.map((c) => (
                        <tr key={c.id} className="hover:bg-surface-hover">
                          <td className={`${td} max-w-[220px]`}>
                            <Link href={`/customers/${c.id}`} className="block truncate text-accent hover:underline">
                              {c.name}
                            </Link>
                          </td>
                          <td className={`${td} w-[38%]`}>
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-sm bg-surface-hover">
                                <div
                                  className={`h-2 rounded-sm ${c.share > 30 ? 'bg-amber-500/70' : 'bg-accent/70'}`}
                                  style={{ width: `${Math.min(100, c.share)}%` }}
                                />
                              </div>
                              <span className="w-10 text-right text-xs tabular-nums text-muted">{c.share} %</span>
                            </div>
                          </td>
                          <td className={tdR}>{c.projects}</td>
                          <td className={`${tdR} font-medium`}>{money(c.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {topCustomer && topCustomer.share > 30 && (
                    <p className={`border-t border-border px-3 py-2 text-[12px] ${warn}`}>
                      ⚠ {t('concentrationWarning', { name: topCustomer.name, share: topCustomer.share })}
                    </p>
                  )}
                </>
              )}
            </section>

            <section className={`overflow-hidden self-start ${card}`}>
              <div className="border-b border-border px-3 py-2.5">
                <h2 className="text-sm font-semibold">
                  {t('inactiveTitle')}{' '}
                  <span className="ml-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium tabular-nums">
                    {customers.inactive.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-[11px] text-muted">{t('inactiveHint')}</p>
              </div>
              {customers.inactive.length === 0 ? (
                <p className="px-3 py-4 text-[13px] text-muted">{t('noInactive')}</p>
              ) : (
                <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                  {customers.inactive.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px]">
                      <Link href={`/customers/${c.id}`} className="truncate text-accent hover:underline">
                        {c.name}
                      </Link>
                      <span className="shrink-0 text-[11px] text-muted">
                        {c.lastProject ? formatDate(c.lastProject, locale) : t('never')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ))}

      {/* ── Utilization ──────────────────────────────────── */}
      {tab === 'utilization' && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted">
            {t('utilizationHint')} · {t('workingDays', { count: workingDays })}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                { key: 'e', title: t('workloadTitle'), rows: usage.employees, href: '/employees' },
                { key: 'v', title: t('vehicleUsageTitle'), rows: usage.vehicles, href: '/vehicles' },
              ] as const
            ).map((block) => (
              <section key={block.key} className={`overflow-hidden ${card}`}>
                <h2 className="border-b border-border px-3 py-2.5 text-sm font-semibold">
                  {block.title} <span className="font-normal text-muted">({t('utilizationPct')})</span>
                </h2>
                {block.rows.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted">{t('noUsage')}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {block.rows.map((row) => {
                      const pct = workingDays > 0 ? Math.round((row.days / workingDays) * 100) : null
                      const level = utilizationLevel(pct)
                      const barColor =
                        level === 'low' ? 'bg-amber-500/70' : level === 'high' ? 'bg-emerald-600/80' : 'bg-accent/70'
                      const textColor = level === 'low' ? warn : level === 'high' ? up : ''
                      return (
                        <li
                          key={row.id}
                          className="grid grid-cols-[minmax(0,140px)_1fr_auto_auto] items-center gap-3 px-3 py-1.5 text-[13px]"
                        >
                          <Link href={`${block.href}/${row.id}`} className="truncate text-accent hover:underline">
                            {row.name}
                          </Link>
                          <div className="h-2 rounded-sm bg-surface-hover">
                            <div className={`h-2 rounded-sm ${barColor}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                          </div>
                          <span className={`w-12 text-right font-semibold tabular-nums ${textColor}`}>
                            {pct == null ? '—' : `${pct} %`}
                          </span>
                          <span className="w-14 text-right text-[11px] tabular-nums text-muted">
                            {t('daysShort', { count: row.days })}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      )}

      {/* ── Data quality ─────────────────────────────────── */}
      {tab === 'quality' && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">{t('qualityTitle')}</h2>
            <p className="mt-0.5 text-[11px] text-muted">{t('qualityHint')}</p>
          </div>
          {qualityCount === 0 ? (
            <p className={`${card} p-6 text-sm ${up}`}>✓ {t('qualityAllGood')}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {quality.map((q) => (
                <section key={q.key} className={`overflow-hidden ${card}`}>
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <h3 className="text-[13px] font-medium">
                      {q.key === 'inProgressNoSchedule'
                        ? t('qInProgressNoSchedule')
                        : q.key === 'finishedNoPrice'
                          ? t('qFinishedNoPrice')
                          : q.key === 'noCity'
                            ? t('qNoCity')
                            : q.key === 'cityNotFound'
                              ? t('qCityNotFound')
                              : q.key === 'staleOffers'
                              ? t('qStaleOffers')
                              : q.key === 'stockShort'
                                ? t('qStockShort')
                                : t('qMissingItems')}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                        q.count === 0
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : q.key === 'finishedNoPrice'
                            ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {q.count}
                    </span>
                  </div>
                  {q.count === 0 ? (
                    <p className="px-3 py-2 text-[12px] text-muted">✓</p>
                  ) : (
                    <ul className="max-h-56 divide-y divide-border overflow-y-auto">
                      {q.items.map((it) => (
                        <li key={it.id} className="px-3 py-1.5 text-[13px]">
                          <Link
                            href={q.key === 'missingItems' || q.key === 'stockShort' ? `/warehouse/${it.id}/edit` : `/projects/${it.id}`}
                            className="text-accent hover:underline"
                          >
                            {it.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
