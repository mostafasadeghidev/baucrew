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
  getYearTotals,
  getYearPlan,
  getPlanGaps,
  getYearUsage,
} from '@/lib/reports'
import {
  parsePeriod,
  percentChange,
  cumulativeMonths,
  parseCompareYears,
  quarterBreakdown,
  bestQuarter,
  splitPlanGaps,
  sumRange,
  topSites,
  utilizationLevel,
  workingDaysInPeriod,
  type MonthRange,
} from '@/lib/reports-calc'
import { formatCurrency, formatDate } from '@/lib/format'
import { db } from '@/lib/db'
import { StatusBadge } from '@/components/status-badge'
import { RevenueChart } from '@/components/revenue-chart'
import { ParamTabs } from '@/components/param-tabs'
import { pageTitle, pageToolbar } from '@/components/ui/page-panel'
import { LiveSelect } from '@/components/live-search'
import { PrintButton } from '@/components/print-button'
import { ProjectStatus } from '@/generated/prisma/enums'
import { btn } from '@/components/ui/button'
import { QuarterBreakdown, type QuarterRowView } from '@/components/quarter-breakdown'
import { YearBars } from '@/components/year-bars'
import { YearComparePicker } from '@/components/year-compare-picker'
import { ParamPicker } from '@/components/param-picker'
import { ChartModePicker } from '@/components/chart-mode-picker'
import { formatMinutes } from '@/lib/time-entries'
import { InfoHint } from '@/components/ui/info-hint'

const TABS = ['overview', 'revenue', 'offers', 'projects', 'customers', 'utilization', 'quality'] as const
type Tab = (typeof TABS)[number]

const card = 'rounded-xl border border-border bg-surface shadow-sm'
const kpi = 'rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm'
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
  searchParams: Promise<{ year?: string; period?: string; tab?: string; order?: string; view?: string; compare?: string; chart?: string; qcompare?: string; qyear?: string }>
}) {
  const user = await requireManagement()
  const { year: yearParam, period: periodParam, tab: tabParam, order: orderParam, view: viewParam, compare: compareParam, chart: chartParam, qcompare: quarterCompareParam, qyear: quarterYearParam } = await searchParams
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
  // The years the comparison spans — the same six the year picker offers, so
  // every year in the chart can be opened from it.
  const comparisonYears = Array.from({ length: 6 }, (_, i) => currentYear + 1 - i)
  const showFinancials = canViewFinancials(user)

  const [revenue, prevRevenue, yearTotals, plan, planGaps, pipeline, openOffers, efficiency, usage, statusCounts, customers, quality] = await Promise.all([
    showFinancials ? getYearRevenueOrHistory(year) : null,
    showFinancials ? getYearRevenueOrHistory(year - 1) : null,
    showFinancials ? getYearTotals(comparisonYears) : null,
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
  // Say so when last year's figure is the planning sheet and this year's
  // is not — the sheet against projects must read as that. When both
  // years are the sheet, it is a plain comparison.
  const prevIsSheet = (prevRevenue?.sheetLed ?? false) && !(revenue?.sheetLed ?? false)
  const compareLabel = periodLabel
    ? t(prevIsSheet ? 'vsPrevPeriodSheet' : 'vsPrevPeriod', { period: periodLabel, year: year - 1 })
    : t(prevIsSheet ? 'vsPrevYearSheet' : 'vsPrevYear', { year: year - 1 })

  const hasPlan = plan?.hasPlan ?? false
  // A year the company ran before BauCrew stands on the sheet's own figures.
  // Holding the sheet against itself would only ever show a difference of
  // zero, so the comparison is left out and the source is named instead.
  const fromSheet = revenue?.fromSheet ?? false
  // With a sheet the months ARE the sheet, so there is no plan to hold them
  // against; the comparison is for a year built from projects alone.
  const sheetLed = revenue?.sheetLed ?? false
  /** Where a year's figures come from, shown as the ⓘ beside the revenue heading. */
  const sheetNote = fromSheet
    ? t('fromSheetYear', { year })
    : sheetLed
      ? t('sheetLedYear', { year })
      : null
  const planComparable = hasPlan && !fromSheet && !sheetLed && (plan?.yearTotal ?? 0) > 0
  const visibleMonths = revenue
    ? revenue.months.filter(
        (m) =>
          (!range || (m.month >= range.from && m.month <= range.to)) &&
          (m.own.length > 0 || m.sub.length > 0 || m.extra.length > 0 || (plan?.months[m.month].total ?? 0) > 0)
      )
    : []
  // Newest month first is what somebody looking for "what is running now"
  // wants; the sums, the chart and the quarter ring keep reading the months in
  // their calendar order, so this is a copy and nothing else moves.
  // The revenue tab holds three views of one year. "Monate" is the year as the
  // office plans it; the other two answer what the month cards cannot — which
  // sites carry the year, and whether it is running ahead of the last one.
  const revenueView: '' | 'sites' | 'cumulative' =
    viewParam === 'sites' || viewParam === 'cumulative' ? viewParam : ''
  const topSiteRows = revenue ? topSites(revenue.months, range) : []
  const TOP_SITES = 30
  const topSitesRest = topSiteRows.slice(TOP_SITES).reduce((sum, site) => sum + site.total, 0)
  const cumulativeRows = revenue
    ? cumulativeMonths(
        revenue.months.map((m) => ({ month: m.month, total: m.total })),
        prevRevenue ? prevRevenue.months.map((m) => ({ month: m.month, total: m.total })) : null,
        range
      )
    : []
  const monthsDescending = orderParam === 'desc'
  const orderedMonths = monthsDescending ? [...visibleMonths].reverse() : visibleMonths
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
  // Plan lines without a project: the ones still ahead are work to do, the
  // ones behind are a record of what was planned back then.
  const gaps = planGaps ? splitPlanGaps(planGaps.rows, year, now) : null
  const gapsAheadTotal = gaps ? gaps.upcoming.reduce((sum, g) => sum + g.amount, 0) : 0
  const statusOrder = Object.keys(ProjectStatus) as ProjectStatus[]
  const countByStatus = new Map(statusCounts.map((s) => [s.status, s._count._all]))
  const yearOptions = comparisonYears.map(String)
  // The years the monthly chart is compared against. Absent means the year
  // before — the card as it has always looked. Their months come out of the
  // aggregate the year comparison below already loads, so choosing a fourth
  // year costs no query.
  const MAX_COMPARE = 5
  /**
   * The quarter card carries its comparison on a second line under each sum,
   * so it holds two other years and no more — a third would either wrap that
   * line or shrink the figures it sits under. It keeps its own parameter: the
   * two cards are read for different things and are not tied to each other.
   */
  const MAX_QUARTER_COMPARE = 2
  /** Bars unless the office asks for a curve. */
  const chartMode: 'bars' | 'line' | 'linear' | 'area' =
    chartParam === 'line' || chartParam === 'linear' || chartParam === 'area' ? chartParam : 'bars'
  const compareYears = parseCompareYears(compareParam, year, comparisonYears, MAX_COMPARE)
  const compareSeries = compareYears
    .map((y) => {
      const row = (yearTotals ?? []).find((r) => r.year === y)
      return row
        ? {
            year: y,
            label: String(y),
            ownLabel: t('legendOwn', { year: y }),
            subLabel: t('legendSub', { year: y }),
            months: row.months.map((m) => ({ own: m.own, sub: m.sub })),
          }
        : null
    })
    .filter((row) => row !== null)
  /**
   * The quarter card walks the years on its own. The picker at the top of the
   * page moves everything at once — the sums, the chart, the tables; this one
   * moves the four quarters and leaves the rest of the page where it was, so
   * one year's quarters can be read while another year's figures stand above
   * them. Absent means "whatever the page is on", and choosing the page's own
   * year writes nothing, so the two only come apart on purpose.
   */
  const quarterYear =
    quarterYearParam && /^\d{4}$/.test(quarterYearParam) &&
    comparisonYears.includes(Number(quarterYearParam))
      ? Number(quarterYearParam)
      : year
  const monthsOfYear = (y: number): number[] =>
    y === year
      ? (revenue?.months ?? []).map((m) => m.total)
      : ((yearTotals ?? []).find((r) => r.year === y)?.months ?? []).map((m) => m.total)
  const quarterCompareYears = parseCompareYears(
    quarterCompareParam,
    quarterYear,
    comparisonYears,
    MAX_QUARTER_COMPARE
  )
  const quarterRows = quarterBreakdown(
    monthsOfYear(quarterYear),
    quarterCompareYears
      .map((y) => ({ year: y, months: monthsOfYear(y) }))
      .filter((row) => row.months.length > 0)
  )
  const best = bestQuarter(quarterRows)
  /** Every link out of this page keeps the rest of the page as it stands. */
  const reportHref = (change: { period?: string | null; year?: number } = {}) => {
    const nextYear = change.year ?? year
    const params = new URLSearchParams({ year: String(nextYear) })
    const period = change.period === undefined ? periodParam : change.period
    if (period) params.set('period', period)
    if (tabParam) params.set('tab', tabParam)
    if (orderParam) params.set('order', orderParam)
    if (viewParam) params.set('view', viewParam)
    // An empty comparison is a choice, not an absence — see parseCompareYears.
    if (compareParam !== undefined) params.set('compare', compareParam)
    if (quarterCompareParam !== undefined) params.set('qcompare', quarterCompareParam)
    // The card's own year goes once the page has caught up with it: two names
    // for the same year in one address is how they drift apart later.
    if (quarterYearParam !== undefined && quarterYear !== nextYear)
      params.set('qyear', String(quarterYear))
    if (chartParam) params.set('chart', chartParam)
    return `/reports?${params.toString()}`
  }
  const quarterViews: QuarterRowView[] = quarterRows.map((row) => {
    const key = `q${row.index + 1}`
    // Only the year the page is already on can have a period selected on it.
    const selected = quarterYear === year && periodParam === key
    return {
      label: `Q${row.index + 1}`,
      months: `${shortMonths[row.index * 3]}–${shortMonths[row.index * 3 + 2]}`,
      value: money(row.total),
      share: row.share,
      compare: row.compare.map((c) => ({
        year: c.year,
        percent: c.percent,
        value: money(c.total),
      })),
      // Clicking a quarter of another year takes the whole page to that year
      // and that quarter — otherwise the sums above would answer for one year
      // and the quarter below for another. Clicking the quarter that is
      // already the period goes back to the year: a filter has to be undoable
      // where it is set.
      href: reportHref({ year: quarterYear, period: selected ? null : key }),
      selected,
      running: quarterYear === currentYear && Math.floor(now.getUTCMonth() / 3) === row.index,
    }
  })

  /** The default comparison keeps the title it always had. */
  const chartTitle =
    compareYears.length === 1 && compareYears[0] === year - 1
      ? t('chartTitle', { year, prev: year - 1 })
      : t('chartTitleYear', { year })
  // A year with nothing in it is a blank line, not information — it goes,
  // unless it is the year on screen. The change is against the year below.
  const yearBars = (yearTotals ?? [])
    .filter((r) => r.total > 0 || r.year === year)
    .map((r, i, list) => ({
      year: r.year,
      own: r.own,
      sub: r.sub,
      total: r.total,
      change: percentChange(r.total, list[i + 1]?.total),
    }))
  const workingDays = workingDaysInPeriod(year, range, now)
  const qualityCount = quality.issues.reduce((sum, q) => sum + q.count, 0)
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
      {/* Neither the sidebar nor the top bar is printed, so the sheet carries
          its own title. On screen the sidebar already says "CRM", which
          is why the heading below steps out of sight from md upwards. */}
      <p className="hidden text-lg font-semibold tracking-tight print:block">
        {t('title')}
        <span className="ml-2 text-base font-normal text-muted">
          {periodLabel ? `${periodLabel} ${year}` : year}
        </span>
      </p>
      {/* The page's name and the period it stands on are one bar; the tabs are
          a second, running the width of the page under it. Two sheets rather
          than one: the bar says where you are, the tabs say where you can go,
          and they are not the same question. */}
      <div className={pageToolbar}>
        <h1 className={pageTitle}>{t('title')}</h1>
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
              clears={['qyear']}
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

      <div className="rounded-xl border border-border bg-surface px-4 py-2 shadow-sm print:hidden">
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

            {/* Each card as tall as what is in it: stretched to match its
                neighbour, the chart card ended in a hand's width of nothing. */}
            <div className="grid items-start gap-4 xl:grid-cols-[1fr_360px]">
            <div className={`${card} p-4`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  {chartTitle}
                  {compareYears.length > 0 && (
                    <InfoHint text={t('chartCompareHint', { year })} className="ml-1.5" wide />
                  )}
                </h2>
                {/* The two pickers belong together: they wrap as one, so the
                    shape never ends up on a line of its own. */}
                <div className="flex flex-wrap items-center gap-2">
                  <ChartModePicker
                    value={chartMode === 'bars' ? '' : chartMode}
                    label={t('chartMode')}
                    options={[
                      { value: '', label: t('chartModeBars') },
                      { value: 'line', label: t('chartModeLine') },
                      { value: 'linear', label: t('chartModeLinear') },
                      { value: 'area', label: t('chartModeArea') },
                    ]}
                  />
                  <YearComparePicker
                    options={comparisonYears.filter((y) => y !== year)}
                    selected={compareYears}
                    max={MAX_COMPARE}
                    label={t('compareYears')}
                    maxHint={t('compareMax', { count: MAX_COMPARE })}
                  />
                </div>
              </div>
              <RevenueChart
                year={year}
                months={revenue.months.map((m, i) => ({
                  own: m.ownTotal,
                  sub: m.subTotal,
                  plan: planComparable ? plan!.months[i].total : null,
                }))}
                compare={compareSeries}
                mode={chartMode}
                labels={shortMonths}
                legend={{
                  own: t('legendOwn', { year }),
                  sub: t('legendSub', { year }),
                  plan: t('legendPlan'),
                  total: t('chartTotal'),
                  wholeMonth: t('chartWholeMonth'),
                  changeAgainst: t('vsPrevYear', { year }),
                }}
                locale={locale}
                highlightRange={range}
              />
            </div>

              <div className={`${card} p-4`}>
                {/* The card's name on its own line, and under it the two
                    years it is about, read left to right as a sentence: this
                    year against those. Beside the name they made a row too
                    long for 360 pixels, and it broke differently in every
                    language. */}
                <div className="mb-3 space-y-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                    {t('quarterTitleYear')}
                    <InfoHint text={t('quarterHint')} wide align="end" />
                  </h2>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* The year is the control: the card is read by looking at
                        that number, so it is changed there. */}
                    <ParamPicker
                      param="qyear"
                      label={t('quarterYear')}
                      value={quarterYear === year ? '' : String(quarterYear)}
                      options={comparisonYears.map((y) => ({
                        value: y === year ? '' : String(y),
                        label: String(y),
                      }))}
                      dense
                    />
                    <span className="text-xs text-muted">{t('quarterVersus')}</span>
                    <YearComparePicker
                      options={comparisonYears.filter((y) => y !== quarterYear)}
                      selected={quarterCompareYears}
                      param="qcompare"
                      max={MAX_QUARTER_COMPARE}
                      label={t('compareYears')}
                      maxHint={t('compareMax', { count: MAX_QUARTER_COMPARE })}
                      noneLabel={t('compareNone')}
                      dense
                    />
                  </div>
                </div>
                <QuarterBreakdown
                  rows={quarterViews}
                  year={quarterYear}
                  center={
                    best
                      ? {
                          label: t('quarterBest'),
                          quarter: `Q${best.index + 1}`,
                          share: `${Math.round(best.share * 100)} %`,
                        }
                      : null
                  }
                  labels={{
                    share: t('quarterShare'),
                    change: t('quarterChange'),
                    running: t('quarterRunning'),
                    empty: t('quarterEmpty'),
                  }}
                />
              </div>
            </div>

            {yearBars.length > 1 && (
              <div className={`${card} p-4`}>
                <h2 className="mb-3 text-sm font-semibold">{t('yearComparison')}</h2>
                <YearBars
                  rows={yearBars}
                  selected={year}
                  hrefFor={(y) => `/reports?year=${y}${periodParam ? `&period=${encodeURIComponent(periodParam)}` : ''}`}
                  formatValue={money}
                  legend={{ own: t('ownPeople'), sub: t('sub'), change: t('changeVsPrev') }}
                />
              </div>
            )}

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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {t('revenueTitle')}
                {/* Where the year's figures come from. It used to be a grey box
                    across the top of the tab; it is the same sentence, now only
                    read by whoever asks for it. */}
                {sheetNote && <InfoHint text={sheetNote} className="ml-1.5" wide />}
              </h2>
              <p className="text-xs text-muted">
                {periodLabel ?? t('yearTotal')}:{' '}
                <span className="font-semibold text-foreground tabular-nums">{money(periodRevenueTotal)}</span>
                {planComparable && (
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
              {revenueView === '' && (
              <LiveSelect
                param="order"
                ariaLabel={t('monthOrder')}
                className="min-w-44 print:hidden"
                compact
                options={[
                  { value: '', label: t('monthOrderAsc') },
                  { value: 'desc', label: t('monthOrderDesc') },
                ]}
              />
              )}
            </div>
            <div className="print:hidden">
              <ParamTabs
                param="view"
                ariaLabel={t('revenueTitle')}
                tabs={[
                  { value: '', label: t('viewMonths') },
                  { value: 'sites', label: t('viewSites'), count: topSiteRows.length },
                  { value: 'cumulative', label: t('viewCumulative') },
                ]}
              />
            </div>
            {/* Sites the sheet parks on the year without picking a month yet —
                they belong to no month card, so they get their own line. */}
            {revenueView === '' && hasPlan && !range && plan!.open > 0 && (
              <p className="text-xs text-muted">
                {t('planWithoutMonth', { amount: money(plan!.open) })}
              </p>
            )}
            {revenueView === '' && (orderedMonths.length === 0 ? (
              <p className={`${card} p-6 text-sm text-muted`}>{t('noRevenueInPeriod')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {/* Cards in one row share their rows (subgrid): the "Eigene Leute"
                    line, the SUB line and the rest sit at the same height in every
                    card beside each other, however long the lists above them are. */}
                {orderedMonths.map((m) => (
                  <div key={m.month} className={`grid grid-rows-subgrid row-span-6 ${card}`}>
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <h3 className="text-sm font-semibold">{monthName(m.month)}</h3>
                      <span className="text-sm font-semibold tabular-nums">{money(m.total)}</span>
                    </div>
                    <div className="px-3 pt-1.5 text-[13px]">
                      {m.own.map((p) => (
                        <div key={p.key} className="flex items-center justify-between gap-2 py-0.5">
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
                    <div className="mx-3 mt-1 flex items-center justify-between self-end border-t border-border py-1 text-[13px] font-medium">
                      <span className="flex items-center gap-1.5 italic">
                        {t('ownPeople')}
                        <InfoHint text={t(sheetLed ? 'hintOwnPeopleSheet' : 'hintOwnPeople')} />
                      </span>
                      <span className="tabular-nums">{money(m.ownTotal)}</span>
                    </div>
                    <div className={`px-3 text-[13px] ${m.sub.length > 0 ? 'pt-1' : ''}`}>
                      {m.sub.map((p) => (
                        <div key={p.key} className="flex items-center justify-between gap-2 py-0.5">
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
                    <div
                      className={`mx-3 mt-1 flex items-center justify-between self-end border-t border-border py-1 text-[13px] font-medium ${
                        m.sub.length === 0 ? 'text-muted' : ''
                      }`}
                    >
                      <span className="flex items-center gap-1.5 italic">
                        {t('sub')}
                        <InfoHint text={t(sheetLed ? 'hintSubSheet' : 'hintSub')} />
                      </span>
                      <span className="tabular-nums">{m.sub.length > 0 ? money(m.subTotal) : '—'}</span>
                    </div>
                    <div className="px-3 pb-1.5 text-[13px] empty:p-0">
                      {planComparable && (
                        <div className="mt-1 flex items-center justify-between border-t border-border pt-1 text-xs">
                          <span className="flex items-center gap-1.5 text-muted">
                            {t('planned')}
                            <InfoHint text={t('hintPlan')} />
                          </span>
                          <span className="flex items-center gap-2 tabular-nums">
                            <span className="text-muted">{money(plan!.months[m.month].total)}</span>
                            <span className={`font-medium ${planDelta(m.total, plan!.months[m.month].total).tone}`}>
                              {planDelta(m.total, plan!.months[m.month].total).label}
                            </span>
                          </span>
                        </div>
                      )}
                      {m.extra.length > 0 && (
                        <div className="mt-1 border-t border-dashed border-border pt-1 text-xs text-muted">
                          <div className="flex items-center justify-between font-medium">
                            <span className="flex items-center gap-1.5 italic">
                              {t('extraTitle')}
                              <InfoHint text={t('hintExtra')} />
                            </span>
                            <span className="tabular-nums">{money(m.extraTotal)}</span>
                          </div>
                          {m.extra.map((p) => (
                            <div key={p.key} className="flex items-center justify-between gap-2 py-0.5">
                              <Link href={`/projects/${p.id}`} className="truncate text-accent hover:underline">
                                {p.name}
                              </Link>
                              <span className="shrink-0 tabular-nums">{money(p.price)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* The year's biggest sites: the month lines of one project folded
                into the job the office actually talks about. */}
            {revenueView === 'sites' &&
              (topSiteRows.length === 0 ? (
                <p className={`${card} p-6 text-sm text-muted`}>{t('noRevenueInPeriod')}</p>
              ) : (
                <div className={`overflow-hidden ${card}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-subtle">
                        <tr>
                          <th className={`${th} w-10`} />
                          <th className={th}>{t('colProject')}</th>
                          <th className={th}>{t('colCustomer')}</th>
                          <th className={thR}>{t('colRevenue')}</th>
                          <th className={thR}>{t('colShare')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {topSiteRows.slice(0, TOP_SITES).map((site, i) => (
                          <tr key={site.key} className="hover:bg-surface-hover">
                            <td className={`${tdR} text-muted`}>{i + 1}</td>
                            <td className={td}>
                              {site.id ? (
                                <Link href={`/projects/${site.id}`} className="text-accent hover:underline">
                                  {site.name}
                                </Link>
                              ) : (
                                site.name
                              )}
                              {site.lines > 1 && (
                                <span className="ml-2 text-xs text-muted">
                                  {t('sitesMonths', { count: site.lines })}
                                </span>
                              )}
                            </td>
                            <td className={`${td} text-muted`}>{site.customer || '—'}</td>
                            <td className={tdR}>{money(site.total)}</td>
                            <td className={`${tdR} text-muted`}>
                              {periodRevenueTotal > 0
                                ? `${Math.round((site.total / periodRevenueTotal) * 100)} %`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {topSiteRows.length > TOP_SITES && (
                    <p className="border-t border-border px-3 py-2 text-xs text-muted">
                      {t('sitesMore', {
                        count: topSiteRows.length - TOP_SITES,
                        amount: money(topSitesRest),
                      })}
                    </p>
                  )}
                </div>
              ))}

            {/* The year adding up, month by month, beside the same months of the
                year before — "are we ahead, and since when". */}
            {revenueView === 'cumulative' &&
              (cumulativeRows.length === 0 ? (
                <p className={`${card} p-6 text-sm text-muted`}>{t('noRevenueInPeriod')}</p>
              ) : (
                <div className={`overflow-hidden ${card}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-subtle">
                        <tr>
                          <th className={th}>{t('colMonth')}</th>
                          <th className={thR}>{t('colRevenue')}</th>
                          <th className={thR}>{t('colCumulative')}</th>
                          <th className={thR}>{t('colPrevCumulative', { year: year - 1 })}</th>
                          <th className={thR}>{t('colDelta')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {cumulativeRows.map((row) => (
                          <tr key={row.month}>
                            <td className={td}>{monthName(row.month)}</td>
                            <td className={`${tdR} text-muted`}>{money(row.total)}</td>
                            <td className={`${tdR} font-semibold`}>{money(row.running)}</td>
                            <td className={`${tdR} text-muted`}>
                              {row.prevRunning == null ? '—' : money(row.prevRunning)}
                            </td>
                            <td
                              className={`${tdR} font-medium ${
                                row.delta == null ? 'text-muted' : row.delta >= 0 ? up : down
                              }`}
                            >
                              {row.delta == null
                                ? '—'
                                : `${row.delta >= 0 ? '+' : '−'}${money(Math.abs(row.delta))}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

            {/* Projects that belong to no month yet — shown, never guessed into one. */}
            {revenueView === '' && !fromSheet && (revenue.undated.length > 0 || revenue.undatedHistorical > 0) && (
              <div
                className={`${card} p-4 ${revenue.undated.length > 0 ? 'border-amber-500/40' : ''}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t('undatedTitle')}</h3>
                  {revenue.undated.length > 0 && (
                    <p className="text-xs text-muted">
                      {t('undatedSummary', { count: revenue.undated.length })}{' '}
                      <span className="font-semibold text-foreground tabular-nums">
                        {money(revenue.undatedTotal)}
                      </span>
                    </p>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {revenue.undated.length > 0 && `${t(sheetLed ? 'undatedHintSheet' : 'undatedHint')} `}
                  {revenue.undatedHistorical > 0 && t('undatedHistorical', { count: revenue.undatedHistorical })}
                </p>
                <ul className="mt-2 grid gap-x-6 gap-y-1 text-[13px] empty:hidden sm:grid-cols-2">
                  {revenue.undated.slice(0, 12).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <Link href={`/projects/${p.id}`} className="truncate text-accent hover:underline">
                        {p.number} — {p.name}
                      </Link>
                      <span className="shrink-0 tabular-nums text-muted">{money(p.price)}</span>
                    </li>
                  ))}
                </ul>
                {revenue.undated.length > 12 && (
                  <p className="mt-1 text-xs text-muted">
                    {t('undatedMore', { count: revenue.undated.length - 12 })}
                  </p>
                )}
                {revenue.undated.length > 0 && (
                  <Link
                    href="/reports?tab=quality"
                    className="mt-3 inline-block text-sm text-accent hover:underline"
                  >
                    {t('undatedLink')} →
                  </Link>
                )}
              </div>
            )}

            {/* Promised in the sheet, but no project carries it yet. Only the
                months still ahead are work; earlier ones are a record. */}
            {revenueView === '' && hasPlan && !fromSheet && gaps && gaps.upcoming.length > 0 && (
              <div className={`${card} p-4`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t('planGapsTitle')}</h3>
                  <p className="text-xs text-muted">
                    {t('planGapsSummary', { count: gaps.upcoming.length })}{' '}
                    <span className="font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                      {money(gapsAheadTotal)}
                    </span>
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted">{t('planGapsAheadHint')}</p>
                <ul className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                  {gaps.upcoming.slice(0, 12).map((gap) => (
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
                {gaps.upcoming.length > 12 && (
                  <p className="mt-1 text-xs text-muted">
                    {t('planGapsMore', { count: gaps.upcoming.length - 12 })}
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

            {/* Nothing ahead any more: the rest is an archive, one quiet line. */}
            {revenueView === '' &&
              hasPlan &&
              !fromSheet &&
              gaps &&
              gaps.upcoming.length === 0 &&
              gaps.past.length > 0 && (
              <p className="text-xs text-muted">
                {t('planGapsPast', { count: gaps.past.length })}{' '}
                <Link href={`/reports/plan?year=${year}`} className="text-accent hover:underline">
                  {t('planGapsLink')} →
                </Link>
              </p>
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
            <p className="mt-0.5 text-[11px] text-muted">
              {t('qualityHint')}
              {quality.historical > 0 && ` ${t('qualityHistorical', { count: quality.historical })}`}
            </p>
          </div>
          {qualityCount === 0 ? (
            <p className={`${card} p-6 text-sm ${up}`}>✓ {t('qualityAllGood')}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {quality.issues.map((q) => (
                <section key={q.key} className={`overflow-hidden ${card}`}>
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <h3 className="text-[13px] font-medium">
                      {q.key === 'noPlannedStart'
                        ? t('qNoPlannedStart')
                        : q.key === 'inProgressNoSchedule'
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
