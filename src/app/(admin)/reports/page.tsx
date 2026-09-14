import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import {
  getCrewDays,
  getCrewUsage,
  getDataGaps,
  getOpenMoney,
  getOpenOffers,
  getProjectEfficiency,
  getToday,
  getYearPlan,
  getYearRevenueOrHistory,
  getYearTotals,
} from '@/lib/reports'
import { getHistoryCutoff } from '@/lib/history-db'
import {
  parsePeriod,
  percentChange,
  planReached,
  cumulativeMonths,
  customerTotals,
  lostCustomers,
  parseCompareYears,
  quarterBreakdown,
  bestQuarter,
  sumRange,
  monthSiteCount,
  siteMonthRows,
  topSites,
  type MonthRange,
} from '@/lib/reports-calc'
import { REPORT_TABS, TAB_CHOICES, resolveReportsUrl, type ReportTab } from '@/lib/reports-url'
import { formatCurrency, formatDate } from '@/lib/format'
import { addDays, todayUtc } from '@/lib/dates'
import { usualCrew, USUAL_CREW_DAYS } from '@/lib/cockpit'
import { RevenueChart } from '@/components/revenue-chart'
import { ParamTabs } from '@/components/param-tabs'
import { pageTitle, pageToolbar, StickyHead } from '@/components/ui/page-panel'
import { LiveSelect } from '@/components/live-search'
import { PrintButton } from '@/components/print-button'
import { btn } from '@/components/ui/button'
import { QuarterBreakdown, type QuarterRowView } from '@/components/quarter-breakdown'
import { YearBars } from '@/components/year-bars'
import { YearComparePicker } from '@/components/year-compare-picker'
import { ParamPicker } from '@/components/param-picker'
import { ChartModePicker } from '@/components/chart-mode-picker'
import { InfoHint } from '@/components/ui/info-hint'
import { RevenueLayoutPicker } from '@/components/revenue-layout-picker'
import {
  REVENUE_LAYOUT_COOKIE,
  parseRevenueLayoutCookie,
  resolveRevenueLayout,
  revenueCardSummary,
  type GridDensity,
} from '@/lib/revenue-layout'
import {
  CLASS_OF,
  certaintyOf,
  certaintyTotals,
  classTotals,
  monthSituations,
  monthlyAverage,
  orderedLines,
  situationSummary,
  weeklyTurnover,
} from '@/lib/order-situation'
import { RevenueLanes } from './revenue-lanes'
import { RevenueMatrix } from './revenue-matrix'
import { OrderSituation } from './order-situation'
import { TodayView } from './today-view'
import { JobsView } from './jobs-view'
import { UsageView } from './usage-view'
import { GapsView } from './gaps-view'

const card = 'rounded-xl border border-border bg-surface shadow-sm'
const th = 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted'
const thR = `${th} text-right`
const td = 'px-3 py-1.5'
const tdR = `${td} text-right tabular-nums`
const up = 'text-emerald-700 dark:text-emerald-400'
const down = 'text-red-700 dark:text-red-400'
const warn = 'text-amber-700 dark:text-amber-400'

/**
 * Month cards to a row in the revenue grid. The chosen number holds on a wide
 * screen; a narrower one steps down through the smaller counts on the way, so
 * a card never gets narrower than its contents can stand.
 */
const GRID_COLUMNS: Record<GridDensity, string> = {
  '2': 'md:grid-cols-2',
  '3': 'md:grid-cols-2 xl:grid-cols-3',
  '4': 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  '6': 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6',
}

/** Customers listed before the rest is summed into one row. */
const TOP_CUSTOMERS = 12

type Params = {
  year?: string
  period?: string
  tab?: string
  order?: string
  view?: string
  compare?: string
  chart?: string
  qcompare?: string
  qyear?: string
  layout?: string
  per?: string
  open?: string
}

/**
 * The CRM: four tabs, each answering one question, each with one time rule.
 *
 * - Heute — where to look today. Stand heute; the pickers are hidden.
 * - Planumsatz — what the year or period is worth by month, how sure it is,
 *   who carries it and how it compares. Every figure follows Jahr/Zeitraum.
 * - Auslastung — is the crew planned, and how long finished jobs took.
 *   Every figure follows Jahr/Zeitraum.
 * - Datenlücken — what makes a figure wrong or incomplete. Stand heute.
 *
 * An address of the eight tabs this page used to have is sent on to the tab
 * that took over its content (`src/lib/reports-url.ts`).
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireManagement()
  const params = await searchParams
  const moved = resolveReportsUrl(params)
  if (moved) redirect(moved)

  const {
    year: yearParam,
    period: periodParam,
    tab: tabParam,
    order: orderParam,
    view: viewParam,
    compare: compareParam,
    chart: chartParam,
    qcompare: quarterCompareParam,
    qyear: quarterYearParam,
    layout: layoutParam,
    per: perParam,
    open: openParam,
  } = params
  const [t, locale, cookieStore] = await Promise.all([getTranslations('reports'), getLocale(), cookies()])
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'

  const today = todayUtc()
  const currentYear = today.getUTCFullYear()
  const todayMonth = today.getUTCMonth()
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : currentYear
  const range: MonthRange | null = parsePeriod(periodParam)
  const tab: ReportTab = (REPORT_TABS as readonly string[]).includes(tabParam ?? '') ? ((tabParam ?? '') as ReportTab) : ''
  const showFinancials = canViewFinancials(user)
  // The years the comparison spans — the same six the year picker offers, so
  // every year in the chart can be opened from it.
  const comparisonYears = Array.from({ length: 6 }, (_, i) => currentYear + 1 - i)
  const onToday = tab === ''
  const onJobs = tab === 'jobs'
  const onRevenue = tab === 'revenue' && showFinancials
  const onUsage = tab === 'utilization'
  const onGaps = tab === 'quality'
  // The team tile holds today's crew against the usual one, read from the
  // working days of the last three months.
  const usualFrom = addDays(today, -USUAL_CREW_DAYS)

  const [
    gaps,
    cutoff,
    todayData,
    openMoney,
    thisYear,
    lastYear,
    nextYear,
    crewDayList,
    revenue,
    prevRevenue,
    yearTotals,
    plan,
    openOffers,
    usage,
    efficiency,
  ] = await Promise.all([
    // Every tab carries the Datenlücken count on its tab.
    getDataGaps(today),
    onToday || onJobs || onGaps ? getHistoryCutoff() : null,
    onToday || onJobs ? getToday(today) : null,
    (onToday || onJobs) && showFinancials ? getOpenMoney() : null,
    // Heute reads the running year whatever year the pickers stand on.
    onToday && showFinancials ? getYearRevenueOrHistory(currentYear) : null,
    onToday && showFinancials ? getYearRevenueOrHistory(currentYear - 1) : null,
    // The backlog runs twelve months, so it reaches into the next year.
    onToday && showFinancials ? getYearRevenueOrHistory(currentYear + 1) : null,
    onToday ? getCrewDays(usualFrom, addDays(today, -1)) : null,
    onRevenue ? getYearRevenueOrHistory(year) : null,
    onRevenue ? getYearRevenueOrHistory(year - 1) : null,
    onRevenue ? getYearTotals(comparisonYears) : null,
    onRevenue ? getYearPlan(year) : null,
    onRevenue ? getOpenOffers() : null,
    onUsage ? getCrewUsage(year, range) : null,
    onUsage ? getProjectEfficiency(year, range) : null,
  ])

  // ── Formatting helpers ───────────────────────────────────
  const monthFmt = new Intl.DateTimeFormat(intl, { month: 'long', timeZone: 'UTC' })
  const shortMonthFmt = new Intl.DateTimeFormat(intl, { month: 'short', timeZone: 'UTC' })
  const narrowMonthFmt = new Intl.DateTimeFormat(intl, { month: 'narrow', timeZone: 'UTC' })
  const monthName = (m: number) => monthFmt.format(new Date(Date.UTC(2000, m, 1)))
  const shortMonths = Array.from({ length: 12 }, (_, m) => shortMonthFmt.format(new Date(Date.UTC(2000, m, 1))))
  const monthNames = {
    long: Array.from({ length: 12 }, (_, m) => monthName(m)),
    short: shortMonths,
    narrow: Array.from({ length: 12 }, (_, m) => narrowMonthFmt.format(new Date(Date.UTC(2000, m, 1)))),
  }
  const money = (v: number | null | undefined) => formatCurrency(v, locale)
  const whole = (v: number) => formatCurrency(v, locale, { whole: true })
  /** "Mai" or "Jan–Aug". */
  const monthSpan = (from: number, to: number) => (from === to ? monthName(from) : `${shortMonths[from]}–${shortMonths[to]}`)

  /** Human label of the selected period ("August", "3. Quartal", "1. Halbjahr"). */
  const periodLabel = (() => {
    if (!range) return null
    const len = range.to - range.from + 1
    if (len === 1) return monthName(range.from)
    if (len === 3) return t('periodQuarter', { n: range.from / 3 + 1 })
    if (len === 6) return t('periodHalf', { n: range.from / 6 + 1 })
    return `${shortMonths[range.from]}–${shortMonths[range.to]}`
  })()
  const frameLabel = periodLabel ? `${periodLabel} ${year}` : String(year)
  const standLabel = t('standDate', { date: formatDate(today, locale) })

  /** Every link out of this page keeps the rest of the page as it stands. */
  const reportHref = (change: { period?: string | null; year?: number } = {}) => {
    const nextYearValue = change.year ?? year
    const query = new URLSearchParams({ year: String(nextYearValue) })
    const period = change.period === undefined ? periodParam : change.period
    if (period) query.set('period', period)
    if (tabParam) query.set('tab', tabParam)
    if (orderParam) query.set('order', orderParam)
    if (viewParam) query.set('view', viewParam)
    // An empty comparison is a choice, not an absence — see parseCompareYears.
    if (compareParam !== undefined) query.set('compare', compareParam)
    if (quarterCompareParam !== undefined) query.set('qcompare', quarterCompareParam)
    if (quarterYearParam !== undefined && quarterYearParam !== String(nextYearValue)) query.set('qyear', quarterYearParam)
    if (chartParam) query.set('chart', chartParam)
    // How the revenue months are drawn: a layout that came in on a link has no
    // cookie behind it, so the address is all that holds it.
    if (layoutParam) query.set('layout', layoutParam)
    if (perParam) query.set('per', perParam)
    return `/reports?${query.toString()}`
  }

  // ── Heute ────────────────────────────────────────────────
  const todayTiles = (() => {
    if (!onToday) return null
    const totals = thisYear ? thisYear.months.map((m) => m.total) : null
    const lastTotals = lastYear && lastYear.yearTotal > 0 ? lastYear.months.map((m) => m.total) : null
    const running = thisYear?.months[todayMonth]
    const monthPlan =
      totals && running
        ? {
            label: monthName(todayMonth),
            total: totals[todayMonth],
            average: monthlyAverage(totals, lastTotals, todayMonth),
            lastYear: lastTotals ? { year: currentYear - 1, total: lastTotals[todayMonth] } : null,
            classes: classTotals(certaintyTotals([...running.own, ...running.sub])),
            // The month's lines, the biggest first, each with where its money stands.
            lines: [...running.own, ...running.sub]
              .map((line) => ({
                key: line.key,
                id: line.fromSheet ? null : line.id,
                name: line.name,
                customer: line.customer,
                amount: line.price,
                cls: CLASS_OF[certaintyOf(line.fromSheet ? undefined : line.status, line.settled)],
              }))
              .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
          }
        : null
    const summary =
      thisYear && totals
        ? situationSummary(
            monthSituations({ year: currentYear, months: thisYear.months, lastYear: null, crew: null, offers: [] }),
            todayMonth,
            weeklyTurnover(totals, lastTotals, todayMonth),
            nextYear ? nextYear.months.map((m) => certaintyTotals([...m.own, ...m.sub]).ordered) : null
          )
        : null
    // The twelve months the backlog runs over, each with its ordered jobs: this
    // year's from the running month on, then next year's before it.
    const backlogMonths = Array.from({ length: 12 }, (_, i) => {
      const index = todayMonth + i
      const inNext = index > 11
      const month = index % 12
      const source = (inNext ? nextYear : thisYear)?.months[month]
      const lines = source ? orderedLines([...source.own, ...source.sub]) : []
      return {
        label: `${monthName(month)} ${inNext ? currentYear + 1 : currentYear}`,
        amount: lines.reduce((sum, line) => sum + (line.price ?? 0), 0),
        lines: lines.map((line) => ({
          key: line.key,
          id: line.id,
          number: line.number,
          name: line.name,
          customer: line.customer,
          amount: line.price,
        })),
      }
    })
    return {
      monthPlan,
      backlog: summary
        ? { label: monthName(todayMonth), amount: summary.backlog ?? 0, weeks: summary.weeks, months: backlogMonths }
        : null,
      usualCrew: usualCrew(crewDayList ?? []),
    }
  })()

  // ── Planumsatz ───────────────────────────────────────────
  const revenueView: '' | 'sites' | 'customers' | 'compare' =
    viewParam === 'sites' || viewParam === 'customers' || viewParam === 'compare' ? viewParam : ''
  const runningMonth = year === currentYear ? todayMonth : -1
  const fromSheet = revenue?.fromSheet ?? false
  const sheetLed = revenue?.sheetLed ?? false
  /** Where a year's figures come from, shown as the ⓘ beside the heading. */
  const sheetNote = fromSheet ? t('fromSheetYear', { year }) : sheetLed ? t('sheetLedYear', { year }) : null
  const hasPlan = plan?.hasPlan ?? false
  const planComparable = hasPlan && !fromSheet && !sheetLed && (plan?.yearTotal ?? 0) > 0
  const monthTotals = revenue ? revenue.months.map((m) => m.total) : []
  const prevTotals = prevRevenue ? prevRevenue.months.map((m) => m.total) : null
  const periodRevenueTotal = revenue ? sumRange(monthTotals, range) : 0
  const periodSubTotal = revenue ? sumRange(revenue.months.map((m) => m.subTotal), range) : 0
  const periodPlanTotal = plan ? sumRange(plan.months.map((m) => m.total), range) : 0
  const frame = range ?? { from: 0, to: 11 }
  const sumMonths = (values: number[] | null, from: number, to: number) =>
    values ? values.slice(from, to + 1).reduce((a, b) => a + b, 0) : 0

  /**
   * The one year-on-year figure on the tab. In the running year only months
   * that are over are compared — the running month and the ones ahead are
   * named with what is planned in them, never counted as done.
   */
  const comparison: Array<{ text: string; tone: string }> = (() => {
    if (!revenue) return []
    const change = (cur: number, prev: number) => {
      const pct = percentChange(cur, prev)
      return pct === null ? null : { label: `${pct >= 0 ? '+' : '−'}${Math.abs(pct)} %`, tone: pct >= 0 ? up : down }
    }
    if (year > currentYear || (year === currentYear && frame.from >= todayMonth)) {
      const parts = [{ text: t('compareNoClosedMonth'), tone: 'text-muted' }]
      if (year === currentYear && frame.from === todayMonth)
        parts.push({ text: t('compareRunning', { month: monthName(todayMonth), amount: whole(monthTotals[todayMonth]) }), tone: '' })
      if (year === currentYear && frame.to > todayMonth)
        parts.push({
          text: t('comparePlanned', {
            months: monthSpan(Math.max(frame.from, todayMonth + 1), frame.to),
            amount: whole(sumMonths(monthTotals, Math.max(frame.from, todayMonth + 1), frame.to)),
          }),
          tone: '',
        })
      return parts
    }
    const closedTo = year === currentYear ? Math.min(frame.to, todayMonth - 1) : frame.to
    const cur = sumMonths(monthTotals, frame.from, closedTo)
    const prev = sumMonths(prevTotals, frame.from, closedTo)
    const delta = prevTotals && prev > 0 ? change(cur, prev) : null
    const parts: Array<{ text: string; tone: string }> = [
      {
        text:
          year === currentYear
            ? t('compareUntil', { month: monthName(closedTo), amount: whole(cur) })
            : t('compareFrame', { frame: frameLabel, amount: whole(cur) }),
        tone: 'font-medium text-foreground',
      },
      delta
        ? {
            text: t('compareAgainst', {
              change: delta.label,
              months: monthSpan(frame.from, closedTo),
              year: year - 1,
              amount: whole(prev),
            }),
            tone: delta.tone,
          }
        : { text: t('noPrevYear'), tone: 'text-muted' },
    ]
    if (year === currentYear && frame.to >= todayMonth) {
      parts.push({ text: t('compareRunning', { month: monthName(todayMonth), amount: whole(monthTotals[todayMonth]) }), tone: '' })
      if (frame.to > todayMonth)
        parts.push({
          text: t('comparePlanned', {
            months: monthSpan(todayMonth + 1, frame.to),
            amount: whole(sumMonths(monthTotals, todayMonth + 1, frame.to)),
          }),
          tone: '',
        })
    }
    return parts
  })()

  // What the Planumsatz leaves out, said next to it rather than on another page.
  const extraInFrame = revenue
    ? revenue.months.filter((m) => m.month >= frame.from && m.month <= frame.to).reduce((n, m) => n + m.extra.length, 0)
    : 0
  const withoutMonth = !range && plan ? plan.open : 0
  const gapParts = [
    gaps.valueOrDate.length > 0 ? t('signValueOrDate', { count: gaps.valueOrDate.length }) : null,
    gaps.valueVsPlan.length > 0 ? t('signValueVsPlan', { count: gaps.valueVsPlan.length }) : null,
    gaps.subConflict.length > 0 ? t('signSub', { count: gaps.subConflict.length }) : null,
    gaps.notInPlan.length > 0 ? t('signNotInPlan', { count: gaps.notInPlan.length }) : null,
    gaps.looseLines.length > 0 ? t('signLooseLines', { count: gaps.looseLines.length }) : null,
  ].filter((part): part is string => part !== null)

  const visibleMonths = revenue
    ? revenue.months.filter(
        (m) =>
          (!range || (m.month >= range.from && m.month <= range.to)) &&
          (m.own.length > 0 || m.sub.length > 0 || m.extra.length > 0 || (plan?.months[m.month].total ?? 0) > 0)
      )
    : []
  const topSiteRows = revenue ? topSites(revenue.months, range) : []
  const TOP_SITES = 30
  const topSitesRest = topSiteRows.slice(TOP_SITES).reduce((sum, site) => sum + site.total, 0)
  const monthsDescending = orderParam === 'desc'
  const orderedMonths = monthsDescending ? [...visibleMonths].reverse() : visibleMonths
  // The months as a grid of cards, as lanes or as the year matrix, and each
  // one's zoom: what the address says, else what this browser chose last time.
  const monthsLayout = resolveRevenueLayout(
    parseRevenueLayoutCookie(cookieStore.get(REVENUE_LAYOUT_COOKIE)?.value),
    layoutParam,
    perParam
  )
  const summaryCards = revenueCardSummary(monthsLayout)
  // The ⓘ bubbles hang below their mark and open to the right, about as wide as
  // a card of three. From four to a row the right-hand card's run off the
  // window, so there the labels stand on their own.
  const hints = monthsLayout.grid === '2' || monthsLayout.grid === '3'
  const monthOrder = orderedMonths.map((m) => m.month)
  const foldSites = revenue !== null && revenueView === '' && monthsLayout.layout !== 'grid'
  const siteRows = foldSites ? siteMonthRows(revenue.months, monthOrder) : []
  const extraSiteRows = foldSites
    ? siteMonthRows(
        revenue.months.map((m) => ({ month: m.month, own: m.extra, sub: [] })),
        monthOrder
      )
    : []
  const lastYearMonths = prevRevenue && prevRevenue.yearTotal > 0 ? prevTotals : null
  const situationMonths =
    revenue && revenueView === '' && !revenue.fromSheet
      ? monthSituations({
          year,
          months: revenue.months,
          lastYear: lastYearMonths,
          crew: null,
          offers: openOffers?.offers ?? [],
        })
      : null
  const cardPad = summaryCards ? 'px-2' : 'px-3'
  const cardInset = summaryCards ? 'mx-2' : 'mx-3'
  const cardText = summaryCards ? 'text-xs' : 'text-[13px]'
  const cardWrap = summaryCards ? 'flex-wrap gap-x-2' : ''
  /** Whole euros on a summary card — the cents do not fit — with the exact figure on hover. */
  const cardMoney = (v: number) => (summaryCards ? whole(v) : money(v))
  const exact = (v: number) => (summaryCards ? money(v) : undefined)
  /** Actual against plan: green once the plan is reached (see planReached), amber below it. */
  const planDelta = (actual: number, planned: number, format: (v: number) => string = money) => {
    const { reached, label } = planReached(actual, planned, format)
    return { tone: reached ? up : warn, label }
  }

  // Customers: the same lines and total as the months, split by who they are for.
  const customers = revenue && revenueView === 'customers' ? customerTotals(revenue.months, range) : null
  const customersBefore = prevRevenue && revenueView === 'customers' ? customerTotals(prevRevenue.months, range) : null
  const lost = customers && customersBefore ? lostCustomers(customers.rows, customersBefore.rows) : []
  const topNamed = customers?.rows.find((r) => r.id !== null)

  // Vergleich: the chart, the quarters, the years and the running sum.
  const MAX_COMPARE = 5
  /**
   * The quarter card carries its comparison on a second line under each sum,
   * so it holds two other years and no more — a third would either wrap that
   * line or shrink the figures it sits under.
   */
  const MAX_QUARTER_COMPARE = 2
  const onCompare = revenueView === 'compare'
  const chartMode: 'bars' | 'line' | 'linear' | 'area' =
    chartParam === 'line' || chartParam === 'linear' || chartParam === 'area' ? chartParam : 'bars'
  const compareYears = parseCompareYears(compareParam, year, comparisonYears, MAX_COMPARE)
  const compareSeries = onCompare
    ? compareYears
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
    : []
  const quarterYear =
    quarterYearParam && /^\d{4}$/.test(quarterYearParam) && comparisonYears.includes(Number(quarterYearParam))
      ? Number(quarterYearParam)
      : year
  const monthsOfYear = (y: number): number[] =>
    y === year ? monthTotals : ((yearTotals ?? []).find((r) => r.year === y)?.months ?? []).map((m) => m.total)
  const quarterCompareYears = parseCompareYears(quarterCompareParam, quarterYear, comparisonYears, MAX_QUARTER_COMPARE)
  const quarterRows = onCompare
    ? quarterBreakdown(
        monthsOfYear(quarterYear),
        quarterCompareYears.map((y) => ({ year: y, months: monthsOfYear(y) })).filter((row) => row.months.length > 0)
      )
    : []
  const best = bestQuarter(quarterRows)
  const quarterViews: QuarterRowView[] = quarterRows.map((row) => {
    const key = `q${row.index + 1}`
    // Only the year the page is already on can have a period selected on it.
    const selected = quarterYear === year && periodParam === key
    return {
      label: `Q${row.index + 1}`,
      months: `${shortMonths[row.index * 3]}–${shortMonths[row.index * 3 + 2]}`,
      value: money(row.total),
      share: row.share,
      compare: row.compare.map((c) => ({ year: c.year, percent: c.percent, value: money(c.total) })),
      // Clicking a quarter of another year takes the whole page to that year
      // and that quarter; clicking the quarter that is already the period goes
      // back to the year.
      href: reportHref({ year: quarterYear, period: selected ? null : key }),
      selected,
      running: quarterYear === currentYear && Math.floor(todayMonth / 3) === row.index,
    }
  })
  const chartTitle =
    compareYears.length === 1 && compareYears[0] === year - 1
      ? t('chartTitle', { year, prev: year - 1 })
      : t('chartTitleYear', { year })
  const yearBars = (yearTotals ?? [])
    .filter((r) => r.total > 0 || r.year === year)
    .map((r, i, list) => ({
      year: r.year,
      own: r.own,
      sub: r.sub,
      total: r.total,
      change: percentChange(r.total, list[i + 1]?.total),
    }))
  const cumulativeRows =
    revenue && onCompare
      ? cumulativeMonths(
          revenue.months.map((m) => ({ month: m.month, total: m.total })),
          prevRevenue ? prevRevenue.months.map((m) => ({ month: m.month, total: m.total })) : null,
          range
        )
      : []

  const exportHref = `/reports/export?year=${year}${periodParam ? `&period=${encodeURIComponent(periodParam)}` : ''}`
  const yearOptions = comparisonYears.map(String)
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

  const tabs = [
    { value: '', label: t('tabToday') },
    { value: 'jobs', label: t('tabJobs') },
    ...(showFinancials ? [{ value: 'revenue', label: t('tabPlan') }] : []),
    { value: 'utilization', label: t('tabUtilization') },
    { value: 'quality', label: t('tabGaps'), count: gaps.count },
  ]
  const tabLabel = tabs.find((x) => x.value === tab)?.label ?? t('tabPlan')
  const intro = onToday
    ? t('introToday')
    : onJobs
      ? t('introJobs')
      : tab === 'revenue'
      ? t('introPlan')
      : onUsage
        ? t('introUsage')
        : t('introGaps')
  const timeTab = tab === 'revenue' || onUsage

  return (
    <div className="space-y-4">
      {/* Neither the sidebar nor the top bar is printed, so the sheet carries
          its own title: the tab and what time it stands for. */}
      <p className="hidden text-lg font-semibold tracking-tight print:block">
        {t('title')} · {tabLabel}
        <span className="ml-2 text-base font-normal text-muted">{timeTab ? frameLabel : standLabel}</span>
      </p>
      <StickyHead>
        <div className={pageToolbar}>
          <h1 className={pageTitle}>{t('title')}</h1>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {timeTab ? (
              // Year and period belong together, and only where every figure follows them.
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-subtle px-2 py-1">
                <CalendarRange className="h-4 w-4 shrink-0 text-muted" aria-hidden />
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
            ) : (
              <span
                className="flex items-center gap-1.5 rounded-lg border border-border bg-subtle px-2.5 py-1.5 text-xs text-muted"
                title={t('standHint')}
              >
                <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
                {standLabel}
              </span>
            )}
            <PrintButton label={t('print')} />
            {showFinancials && timeTab && (
              <a href={exportHref} className={btn.outlineSm}>
                {t('exportExcel')}
              </a>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface px-4 py-2 shadow-sm print:hidden">
          <ParamTabs ariaLabel={t('title')} tabs={tabs} clears={TAB_CHOICES} />
        </div>
      </StickyHead>

      {/* What the tab answers and how to read it, in one sentence. */}
      <p className="text-[13px] text-muted print:hidden">{intro}</p>

      {/* ── Heute ─────────────────────────────────────────── */}
      {onToday && todayData && todayTiles && (
        <TodayView
          data={todayData}
          money={openMoney}
          showFinancials={showFinancials}
          locale={locale}
          today={today}
          monthPlan={todayTiles.monthPlan}
          backlog={todayTiles.backlog}
          usualCrew={todayTiles.usualCrew}
          gaps={gaps}
          cutoff={cutoff}
        />
      )}

      {/* ── Aufträge & Baustellen ──────────────────────────── */}
      {onJobs && todayData && (
        <JobsView
          data={todayData}
          money={openMoney}
          showFinancials={showFinancials}
          locale={locale}
          today={today}
          open={openParam}
          cutoff={cutoff}
        />
      )}

      {/* ── Planumsatz ───────────────────────────────────── */}
      {tab === 'revenue' && !showFinancials && <p className={`${card} p-6 text-sm text-muted`}>{t('noAccess')}</p>}
      {onRevenue && revenue && (
        <section className="space-y-3">
          <div className={`${card} space-y-2 p-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {t('planHeader', { frame: frameLabel })}
                {range && (
                  <Link
                    href={reportHref({ period: null })}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted hover:bg-surface-hover print:hidden"
                    title={t('clearPeriod')}
                  >
                    {periodLabel} ×
                  </Link>
                )}
                {sheetNote && <InfoHint text={sheetNote} wide />}
              </h2>
              <p className="text-xs text-muted">
                <span className="text-lg font-semibold tabular-nums text-foreground">{whole(periodRevenueTotal)}</span>
                {periodRevenueTotal > 0 && (
                  <span className="ml-3">
                    {t('planSub', {
                      amount: whole(periodSubTotal),
                      pct: Math.round((periodSubTotal / periodRevenueTotal) * 100),
                    })}
                  </span>
                )}
                {planComparable && (
                  <span className="ml-3">
                    {t('planned')}: <span className="tabular-nums">{money(periodPlanTotal)}</span>{' '}
                    <span className={`font-medium tabular-nums ${planDelta(periodRevenueTotal, periodPlanTotal).tone}`}>
                      {planDelta(periodRevenueTotal, periodPlanTotal).label}
                    </span>
                  </span>
                )}
              </p>
            </div>
            <p className="flex flex-wrap gap-x-2 text-[13px] text-muted">
              {comparison.map((part, i) => (
                <span key={part.text} className={part.tone}>
                  {i > 0 && <span className="mr-2 text-muted">·</span>}
                  {part.text}
                </span>
              ))}
            </p>
            {(withoutMonth > 0 || extraInFrame > 0 || gaps.count > 0) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-[11px] text-muted">
                {(withoutMonth > 0 || extraInFrame > 0) && (
                  <span>
                    {t('notCounted')}{' '}
                    {[
                      withoutMonth > 0 ? t('notCountedNoMonth', { amount: whole(withoutMonth) }) : null,
                      extraInFrame > 0 ? t('notCountedExtra', { count: extraInFrame }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
                {gaps.count > 0 && (
                  <Link href="/reports?tab=quality" className={`${warn} hover:underline print:hidden`}>
                    {t('signpost', { count: gaps.count })}
                    {gapParts.length > 0 && ` — ${gapParts.join(' · ')}`} →
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* What the tab shows on the left, how the months are drawn on the
              right: one row, the way the projects page pairs its status tabs
              with the list/board switch. */}
          <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
            <div className="min-w-0">
              <ParamTabs
                param="view"
                ariaLabel={t('planHeader', { frame: frameLabel })}
                tabs={[
                  { value: '', label: t('viewMonths') },
                  { value: 'sites', label: t('viewSitesPlan'), count: topSiteRows.length },
                  { value: 'customers', label: t('viewCustomers') },
                  { value: 'compare', label: t('viewCompare') },
                ]}
              />
            </div>
            {revenueView === '' && orderedMonths.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <LiveSelect
                  param="order"
                  ariaLabel={t('monthOrder')}
                  className="min-w-44"
                  compact
                  options={[
                    { value: '', label: t('monthOrderAsc') },
                    { value: 'desc', label: t('monthOrderDesc') },
                  ]}
                />
                <RevenueLayoutPicker
                  choice={monthsLayout}
                  labels={{
                    layout: t('monthLayout'),
                    layouts: { grid: t('layoutGrid'), lanes: t('layoutLanes'), matrix: t('layoutMatrix') },
                    zoom: { grid: t('layoutPerRow'), lanes: t('layoutInView'), matrix: t('layoutCells') },
                    cells: { color: t('cellsColor'), short: t('cellsShort'), full: t('cellsFull') },
                  }}
                />
              </div>
            )}
          </div>

          {/* ── Monate ── */}
          {revenueView === '' && situationMonths && (
            <OrderSituation
              // Another year opens fresh, on its own running month or on none.
              key={`situation|${year}|${periodParam ?? ''}`}
              year={year}
              currentYear={currentYear}
              runningMonth={runningMonth}
              months={situationMonths}
              range={range}
              average={runningMonth >= 0 ? monthlyAverage(monthTotals, lastYearMonths, runningMonth) : null}
              monthNames={{ long: monthNames.long, short: monthNames.short }}
            />
          )}
          {revenueView === '' &&
            (orderedMonths.length === 0 ? (
              <p className={`${card} p-6 text-sm text-muted`}>{t('noRevenueInPeriod')}</p>
            ) : monthsLayout.layout === 'lanes' ? (
              <RevenueLanes
                // Another year, period, order or layout opens the box on the
                // running month again, not wherever the last one was left.
                key={`lanes|${year}|${periodParam ?? ''}|${monthsDescending ? 'desc' : 'asc'}`}
                months={orderedMonths}
                density={monthsLayout.lanes}
                runningMonth={runningMonth}
                spans={new Map(siteRows.map((r) => [r.key, r.span]))}
                extraSpans={new Map(extraSiteRows.map((r) => [r.key, r.span]))}
                monthNames={monthNames}
                locale={locale}
              />
            ) : monthsLayout.layout === 'matrix' ? (
              <RevenueMatrix
                key={`matrix|${year}|${periodParam ?? ''}|${monthsDescending ? 'desc' : 'asc'}`}
                rows={siteRows}
                extraRows={extraSiteRows}
                months={orderedMonths}
                density={monthsLayout.matrix}
                runningMonth={runningMonth}
                monthNames={monthNames}
                locale={locale}
              />
            ) : (
              <div className={`grid grid-cols-1 gap-3 ${GRID_COLUMNS[monthsLayout.grid]}`}>
                {/* Cards in one row share their rows (subgrid): the "Eigene Leute"
                    line, the SUB line and the rest sit at the same height in every
                    card beside each other, however long the lists above them are. */}
                {orderedMonths.map((m) => (
                  <div key={m.month} className={`grid grid-cols-[minmax(0,1fr)] grid-rows-subgrid row-span-6 ${card}`}>
                    <div
                      className={`flex items-center justify-between border-b border-border ${
                        summaryCards ? 'flex-wrap gap-x-2 px-2 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'
                      }`}
                    >
                      <h3 className="font-semibold">{monthName(m.month)}</h3>
                      <span className="ml-auto font-semibold tabular-nums" title={exact(m.total)}>
                        {cardMoney(m.total)}
                      </span>
                    </div>
                    {summaryCards ? (
                      <div className="px-2 pt-2 text-[11px] text-muted">
                        {m.total > 0 && (
                          <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-subtle">
                            <span className="bg-accent" style={{ width: `${(Math.max(m.ownTotal, 0) / m.total) * 100}%` }} />
                            <span className="bg-accent/40" style={{ width: `${(Math.max(m.subTotal, 0) / m.total) * 100}%` }} />
                          </div>
                        )}
                        <p className="mt-1">{t('monthSites', { count: monthSiteCount(m) })}</p>
                      </div>
                    ) : (
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
                    )}
                    <div
                      className={`${cardInset} mt-1 flex items-center justify-between self-end border-t border-border py-1 ${cardText} font-medium ${cardWrap}`}
                    >
                      <span className="flex items-center gap-1.5 italic">
                        {summaryCards && <span aria-hidden className="h-2 w-2 shrink-0 rounded-[3px] bg-accent" />}
                        {t('ownPeople')}
                        {hints && <InfoHint text={t(sheetLed ? 'hintOwnPeopleSheet' : 'hintOwnPeople')} />}
                      </span>
                      <span className="ml-auto tabular-nums" title={exact(m.ownTotal)}>
                        {cardMoney(m.ownTotal)}
                      </span>
                    </div>
                    <div className={`px-3 text-[13px] ${m.sub.length > 0 && !summaryCards ? 'pt-1' : ''}`}>
                      {!summaryCards &&
                        m.sub.map((p) => (
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
                      className={`${cardInset} mt-1 flex items-center justify-between self-end border-t border-border py-1 ${cardText} font-medium ${cardWrap} ${
                        m.sub.length === 0 ? 'text-muted' : ''
                      }`}
                    >
                      <span className="flex items-center gap-1.5 italic">
                        {summaryCards && <span aria-hidden className="h-2 w-2 shrink-0 rounded-[3px] bg-accent/40" />}
                        {t('sub')}
                        {hints && <InfoHint text={t(sheetLed ? 'hintSubSheet' : 'hintSub')} />}
                      </span>
                      <span className="ml-auto tabular-nums" title={m.sub.length > 0 ? exact(m.subTotal) : undefined}>
                        {m.sub.length > 0 ? cardMoney(m.subTotal) : '—'}
                      </span>
                    </div>
                    <div className={`${cardPad} pb-1.5 text-[13px] empty:p-0`}>
                      {planComparable && (
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 border-t border-border pt-1 text-xs">
                          <span className="flex items-center gap-1.5 text-muted">
                            {t('planned')}
                            {hints && <InfoHint text={t('hintPlan')} />}
                          </span>
                          <span className="ml-auto flex items-center gap-2 tabular-nums">
                            {!summaryCards && <span className="text-muted">{money(plan!.months[m.month].total)}</span>}
                            <span
                              className={`font-medium ${planDelta(m.total, plan!.months[m.month].total).tone}`}
                              title={exact(plan!.months[m.month].total)}
                            >
                              {planDelta(m.total, plan!.months[m.month].total, cardMoney).label}
                            </span>
                          </span>
                        </div>
                      )}
                      {m.extra.length > 0 && (
                        <div className="mt-1 border-t border-dashed border-border pt-1 text-xs text-muted">
                          <div className={`flex items-center justify-between font-medium ${cardWrap}`}>
                            <span className="flex items-center gap-1.5 italic">
                              {t('extraTitle')}
                              {hints && <InfoHint text={t('hintExtra')} />}
                            </span>
                            <span className="ml-auto tabular-nums" title={exact(m.extraTotal)}>
                              {cardMoney(m.extraTotal)}
                            </span>
                          </div>
                          {!summaryCards &&
                            m.extra.map((p) => (
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

          {/* ── Baustellen: the period's biggest sites ── */}
          {revenueView === 'sites' &&
            (topSiteRows.length === 0 ? (
              <p className={`${card} p-6 text-sm text-muted`}>{t('noRevenueInPeriod')}</p>
            ) : (
              <div className={`overflow-hidden ${card}`}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] table-fixed text-sm">
                    <colgroup>
                      <col className="w-12" />
                      <col />
                      <col className="w-[28%]" />
                      <col className="w-32" />
                      <col className="w-24" />
                    </colgroup>
                    <thead className="border-b border-border bg-subtle">
                      <tr>
                        <th className={`${th} w-10`} />
                        <th className={th}>{t('colProject')}</th>
                        <th className={th}>{t('colCustomer')}</th>
                        <th className={thR}>{t('colPlanRevenue')}</th>
                        <th className={thR}>{t('colShare')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {topSiteRows.slice(0, TOP_SITES).map((site, i) => (
                        <tr key={site.key} className="hover:bg-surface-hover">
                          <td className={`${tdR} text-muted`}>{i + 1}</td>
                          <td className={`${td} break-words`}>
                            {site.id ? (
                              <Link href={`/projects/${site.id}`} className="text-accent hover:underline">
                                {site.name}
                              </Link>
                            ) : (
                              site.name
                            )}
                            {site.lines > 1 && (
                              <span className="ml-2 text-xs text-muted">{t('sitesMonths', { count: site.lines })}</span>
                            )}
                          </td>
                          <td className={`${td} break-words text-muted`}>{site.customer || '—'}</td>
                          <td className={tdR}>{money(site.total)}</td>
                          <td className={`${tdR} text-muted`}>
                            {periodRevenueTotal > 0 ? `${Math.round((site.total / periodRevenueTotal) * 100)} %` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {topSiteRows.length > TOP_SITES && (
                  <p className="border-t border-border px-3 py-2 text-xs text-muted">
                    {t('sitesMore', { count: topSiteRows.length - TOP_SITES, amount: money(topSitesRest) })}
                  </p>
                )}
              </div>
            ))}

          {/* ── Kunden: who the period's Planumsatz is for ── */}
          {customers && (
            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <section className={`overflow-hidden ${card}`}>
                <div className="border-b border-border px-3 py-2.5">
                  <h2 className="text-sm font-semibold">{t('customersPlanTitle', { frame: frameLabel })}</h2>
                  <p className="mt-0.5 text-[11px] text-muted">{t('customersPlanHint')}</p>
                </div>
                {customers.rows.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted">{t('noRevenueInPeriod')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] table-fixed text-[13px]">
                      <colgroup>
                        <col />
                        <col className="w-[34%]" />
                        <col className="w-20" />
                        <col className="w-32" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border">
                          <th className={th}>{t('colCustomer')}</th>
                          <th className={th}>{t('colShare')}</th>
                          <th className={thR}>{t('colJobs')}</th>
                          <th className={thR}>{t('colPlanRevenue')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {customers.rows.slice(0, TOP_CUSTOMERS).map((c) => (
                          <tr key={c.id ?? '__none'} className="hover:bg-surface-hover">
                            <td className={`${td} break-words`}>
                              {c.id ? (
                                <Link href={`/customers/${c.id}`} className="text-accent hover:underline">
                                  {c.name}
                                </Link>
                              ) : (
                                <span className="italic text-muted">{t('customerNone')}</span>
                              )}
                            </td>
                            <td className={td}>
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 rounded-sm bg-surface-hover">
                                  <div
                                    className={`h-2 rounded-sm ${c.id && c.share > 30 ? 'bg-amber-500/70' : c.id ? 'bg-accent/70' : 'bg-muted/40'}`}
                                    style={{ width: `${Math.min(100, c.share)}%` }}
                                  />
                                </div>
                                <span className="w-10 text-right text-xs tabular-nums text-muted">{c.share} %</span>
                              </div>
                            </td>
                            <td className={tdR}>{c.jobs}</td>
                            <td className={`${tdR} font-medium`}>{whole(c.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      {customers.rows.length > TOP_CUSTOMERS && (
                        <tfoot>
                          <tr className="border-t border-border text-muted">
                            <td className={td} colSpan={3}>
                              {t('customersRest', { count: customers.rows.length - TOP_CUSTOMERS })}
                            </td>
                            <td className={tdR}>
                              {whole(customers.rows.slice(TOP_CUSTOMERS).reduce((sum, c) => sum + c.total, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
                {topNamed && topNamed.share > 30 && (
                  <p className={`border-t border-border px-3 py-2 text-[12px] ${warn}`}>
                    ⚠ {t('concentrationPlan', { name: topNamed.name, share: topNamed.share })}
                  </p>
                )}
              </section>

              <section className={`self-start overflow-hidden ${card}`}>
                <div className="border-b border-border px-3 py-2.5">
                  <h2 className="text-sm font-semibold">
                    {t('lostTitle')}{' '}
                    <span className="ml-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium tabular-nums">
                      {lost.length}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {t('lostHint', { before: `${periodLabel ?? ''} ${year - 1}`.trim(), now: frameLabel })}
                  </p>
                </div>
                {lost.length === 0 ? (
                  <p className="px-3 py-4 text-[13px] text-muted">{t('lostNone')}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {lost.slice(0, TOP_CUSTOMERS).map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px]">
                        <Link href={`/customers/${c.id}`} className="truncate text-accent hover:underline">
                          {c.name}
                        </Link>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted">{whole(c.total)}</span>
                      </li>
                    ))}
                    {lost.length > TOP_CUSTOMERS && (
                      <li className="px-3 py-1.5 text-[11px] text-muted">
                        {t('customersRest', { count: lost.length - TOP_CUSTOMERS })}
                      </li>
                    )}
                  </ul>
                )}
              </section>
            </div>
          )}

          {/* ── Vergleich: the year against other years ── */}
          {onCompare && (
            <div className="space-y-4">
              {/* The two stretch to the same height, and the chart takes
                  whatever height is left over inside its card. */}
              <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                <div className={`${card} flex flex-col p-4`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">
                      {chartTitle}
                      {compareYears.length > 0 && (
                        <InfoHint text={t('chartCompareHint', { year })} className="ml-1.5" wide />
                      )}
                    </h2>
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
                  <div className="mb-3 space-y-2">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                      {t('quarterTitleYear')}
                      <InfoHint text={t('quarterHint')} wide align="end" />
                    </h2>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ParamPicker
                        param="qyear"
                        label={t('quarterYear')}
                        value={quarterYear === year ? '' : String(quarterYear)}
                        options={comparisonYears.map((y) => ({ value: y === year ? '' : String(y), label: String(y) }))}
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
                        ? { label: t('quarterBest'), quarter: `Q${best.index + 1}`, share: `${Math.round(best.share * 100)} %` }
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
                    hrefFor={(y) =>
                      `/reports?tab=revenue&view=compare&year=${y}${periodParam ? `&period=${encodeURIComponent(periodParam)}` : ''}`
                    }
                    formatValue={money}
                    legend={{ own: t('ownPeople'), sub: t('sub'), change: t('changeVsPrev') }}
                  />
                </div>
              )}

              {cumulativeRows.length > 0 && (
                <div className={`overflow-hidden ${card}`}>
                  <h2 className="border-b border-border px-3 py-2.5 text-sm font-semibold">{t('cumulativeTitle')}</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] table-fixed text-sm">
                      <colgroup>
                        <col />
                        <col className="w-36" />
                        <col className="w-36" />
                        <col className="w-36" />
                        <col className="w-36" />
                      </colgroup>
                      <thead className="border-b border-border bg-subtle">
                        <tr>
                          <th className={th}>{t('colMonth')}</th>
                          <th className={thR}>{t('colPlanRevenue')}</th>
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
                            <td className={`${tdR} text-muted`}>{row.prevRunning == null ? '—' : money(row.prevRunning)}</td>
                            <td className={`${tdR} font-medium ${row.delta == null ? 'text-muted' : row.delta >= 0 ? up : down}`}>
                              {row.delta == null ? '—' : `${row.delta >= 0 ? '+' : '−'}${money(Math.abs(row.delta))}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Auslastung ───────────────────────────────────── */}
      {onUsage && usage && efficiency && (
        <UsageView
          year={year}
          range={range}
          runningMonth={runningMonth}
          months={usage.months}
          covered={usage.covered}
          people={usage.people}
          vehicles={usage.vehicles}
          efficiency={efficiency}
          showFinancials={showFinancials}
          locale={locale}
          monthNames={{ long: monthNames.long, short: monthNames.short }}
          frameLabel={frameLabel}
        />
      )}

      {/* ── Datenlücken ──────────────────────────────────── */}
      {onGaps && (
        <GapsView
          report={gaps}
          showFinancials={showFinancials}
          locale={locale}
          cutoff={cutoff}
          monthNames={monthNames.long}
        />
      )}
    </div>
  )
}
