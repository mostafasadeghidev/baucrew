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
  getPipeline,
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
  parseCompareYears,
  carryCompareYears,
  compareTones,
  yearsWithData,
  quarterBreakdown,
  bestQuarter,
  siteKey,
  siteMonthRows,
  type MonthRange,
  type SiteRow,
} from '@/lib/reports-calc'
import { REPORT_TABS, TAB_CHOICES, resolveReportsUrl, type ReportTab } from '@/lib/reports-url'
import { formatCurrency, formatDate } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import { movable } from '@/lib/plan-month'
import { addDays, todayUtc } from '@/lib/dates'
import { usualCrew, USUAL_CREW_DAYS } from '@/lib/cockpit'
import { RevenueChart } from '@/components/revenue-chart'
import { MonthDetailPanel, MonthDetailProvider, type MonthDetailData, type MonthDetailLine } from '@/components/month-detail'
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
import { HoverGroups } from '@/components/ui/hover-groups'
import { RevenueLayoutPicker } from '@/components/revenue-layout-picker'
import {
  REVENUE_LAYOUT_COOKIE,
  parseRevenueLayoutCookie,
  resolveRevenueLayout,
  revenueCardsDense,
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
import { DragLine, DropMonth } from './month-drag'
import { RevenueMatrix } from './revenue-matrix'
import { OrderSituation } from './order-situation'
import { TodayView } from './today-view'
import { JobsView } from './jobs-view'
import { PipelineView } from './pipeline-view'
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

/**
 * A site's lines on the month cards while one of them is under the pointer: all
 * its months lit, every other line stepped back — the same as on the lanes.
 * Literal, so Tailwind finds it.
 */
const LINE_LIGHTING =
  'transition-opacity [[data-lighting]_&:not([data-lit])]:opacity-35 data-[lit]:bg-accent/15 data-[lit]:outline data-[lit]:outline-1 data-[lit]:outline-offset-1 data-[lit]:outline-accent/50'

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
  sites?: string
}

/**
 * The CRM: six tabs, each answering one question, each with one time rule.
 *
 * - Heute — where to look today. Stand heute; the pickers are hidden.
 * - Vergleich — the year against other years: by month, by quarter, year by
 *   year and as a running sum. Every figure follows Jahr/Zeitraum.
 * - Aufträge & Baustellen — the long lists behind the Heute tiles. Stand heute.
 * - Planumsatz — what the year or period is worth month by month, and below
 *   the months how sure it is. Every figure follows Jahr/Zeitraum.
 * - Auslastung — is the crew planned, and who and what stands idle.
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
    sites: sitesParam,
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
  const onPipeline = tab === 'pipeline'
  const onRevenue = tab === 'revenue' && showFinancials
  const onCompare = tab === 'compare' && showFinancials
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
    pipeline,
  ] = await Promise.all([
    // Every tab carries the Datenlücken count on its tab.
    getDataGaps(today),
    onToday || onGaps ? getHistoryCutoff() : null,
    onToday || onJobs ? getToday(today) : null,
    onToday && showFinancials ? getOpenMoney() : null,
    // Heute reads the running year whatever year the pickers stand on.
    onToday && showFinancials ? getYearRevenueOrHistory(currentYear) : null,
    onToday && showFinancials ? getYearRevenueOrHistory(currentYear - 1) : null,
    // The backlog runs twelve months, so it reaches into the next year.
    onToday && showFinancials ? getYearRevenueOrHistory(currentYear + 1) : null,
    onToday ? getCrewDays(usualFrom, addDays(today, -1)) : null,
    // Planumsatz and Vergleich both stand on the year, the year before and the plan.
    onRevenue || onCompare ? getYearRevenueOrHistory(year) : null,
    onRevenue || onCompare ? getYearRevenueOrHistory(year - 1) : null,
    onCompare ? getYearTotals(comparisonYears) : null,
    onRevenue || onCompare ? getYearPlan(year) : null,
    onRevenue ? getOpenOffers() : null,
    onUsage ? getCrewUsage(year, range) : null,
    // The pipeline stands on today and the running year, whatever the pickers say.
    onPipeline ? getPipeline(today, currentYear) : null,
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
  const hidePrices = await pricesHidden()
  const money = (v: number | null | undefined) => formatCurrency(v, locale, { hidden: hidePrices })
  const whole = (v: number | null | undefined) => formatCurrency(v, locale, { whole: true, hidden: hidePrices })

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

  // The quarter card may stand on a year of its own.
  const quarterYear =
    quarterYearParam && /^\d{4}$/.test(quarterYearParam) && comparisonYears.includes(Number(quarterYearParam))
      ? Number(quarterYearParam)
      : year
  /**
   * What the two comparisons become once the page moves to another year: the
   * years ticked stay, and the year that was on screen joins them — see
   * `carryCompareYears`. The quarter card follows the page unless it was set
   * to a year of its own, and that year is not the one the page moves to.
   */
  const carriedCompare = (nextYearValue: number) => {
    const quarterFollows = quarterYearParam === undefined || quarterYearParam === String(nextYearValue)
    return {
      compare: carryCompareYears(compareParam, year, nextYearValue),
      qcompare: quarterFollows
        ? carryCompareYears(quarterCompareParam, quarterYear, nextYearValue)
        : quarterCompareParam,
    }
  }

  /** Every link out of this page keeps the rest of the page as it stands. */
  const reportHref = (change: { period?: string | null; year?: number } = {}) => {
    const nextYearValue = change.year ?? year
    const carried = carriedCompare(nextYearValue)
    const query = new URLSearchParams({ year: String(nextYearValue) })
    const period = change.period === undefined ? periodParam : change.period
    if (period) query.set('period', period)
    if (tabParam) query.set('tab', tabParam)
    if (orderParam) query.set('order', orderParam)
    if (viewParam) query.set('view', viewParam)
    // An empty comparison is a choice, not an absence — see parseCompareYears.
    if (carried.compare !== undefined) query.set('compare', carried.compare)
    if (carried.qcompare !== undefined) query.set('qcompare', carried.qcompare)
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
  const runningMonth = year === currentYear ? todayMonth : -1
  const fromSheet = revenue?.fromSheet ?? false
  const hasPlan = plan?.hasPlan ?? false
  // The sheet's figure beside the projects' — wherever there is a sheet and the year is not the sheet alone.
  const planComparable = hasPlan && !fromSheet && (plan?.yearTotal ?? 0) > 0
  const monthTotals = revenue ? revenue.months.map((m) => m.total) : []
  const prevTotals = prevRevenue ? prevRevenue.months.map((m) => m.total) : null

  const visibleMonths = revenue
    ? revenue.months.filter(
        (m) =>
          (!range || (m.month >= range.from && m.month <= range.to)) &&
          (m.own.length > 0 || m.sub.length > 0 || (plan?.months[m.month].total ?? 0) > 0)
      )
    : []
  const monthsDescending = orderParam === 'desc'
  const orderedMonths = monthsDescending ? [...visibleMonths].reverse() : visibleMonths
  // The months as a grid of cards, as lanes or as the year matrix, and each
  // one's zoom: what the address says, else what this browser chose last time.
  const monthsLayout = resolveRevenueLayout(
    parseRevenueLayoutCookie(cookieStore.get(REVENUE_LAYOUT_COOKIE)?.value),
    layoutParam,
    perParam
  )
  const denseCards = revenueCardsDense(monthsLayout)
  // The ⓘ bubbles hang below their mark and open to the right, about as wide as
  // a card of three. From four to a row the right-hand card's run off the
  // window, so there the labels stand on their own.
  const hints = monthsLayout.grid === '2' || monthsLayout.grid === '3'
  const monthOrder = orderedMonths.map((m) => m.month)
  const foldSites = onRevenue && revenue !== null && monthsLayout.layout !== 'grid'
  const siteRows = foldSites ? siteMonthRows(revenue.months, monthOrder) : []
  const lastYearMonths = prevRevenue && prevRevenue.yearTotal > 0 ? prevTotals : null
  const situationMonths =
    onRevenue && revenue && !revenue.fromSheet
      ? monthSituations({
          year,
          months: revenue.months,
          lastYear: lastYearMonths,
          crew: null,
          offers: openOffers?.offers ?? [],
        })
      : null
  const cardPad = denseCards ? 'px-2' : 'px-3'
  const cardInset = denseCards ? 'mx-2' : 'mx-3'
  const cardText = denseCards ? 'text-xs' : 'text-[13px]'
  const cardWrap = denseCards ? 'flex-wrap gap-x-2' : ''
  /** Whole euros on a dense card — the cents do not fit — with the exact figure on hover. */
  const cardMoney = (v: number | null) => (denseCards ? whole(v) : money(v))
  const exact = (v: number | null) => (denseCards ? money(v) : undefined)
  /**
   * A site's line on a month card: its name, cut short with the whole of it on
   * hover, and its amount. A job over several months lights up in all of them
   * (`HoverGroups`). A project's line is dragged into another month; a line of
   * the sheet stays where the sheet has it.
   */
  const siteLine = (p: SiteRow & { key: string }, month: number) => (
    <DragLine key={p.key} projectId={p.id} month={month} enabled={movable(p)} title={movable(p) ? t('dragLine') : undefined}>
      <div data-group={`sheet:${siteKey(p)}`} className={`flex items-center justify-between gap-2 rounded-sm py-0.5 ${LINE_LIGHTING}`}>
        {p.fromSheet ? (
          <span className="truncate" title={p.name}>
            {p.name}
          </span>
        ) : (
          <Link href={`/projects/${p.id}`} title={p.name} className="truncate text-accent hover:underline">
            {p.name}
          </Link>
        )}
        <span className="shrink-0 tabular-nums text-muted" title={exact(p.price)}>
          {cardMoney(p.price)}
        </span>
      </div>
    </DragLine>
  )
  /** Actual against plan: green once the plan is reached (see planReached), amber below it. */
  const planDelta = (actual: number, planned: number, format: (v: number) => string = money) => {
    const { reached, label } = planReached(actual, planned, format)
    return { tone: reached ? up : warn, label }
  }

  // Vergleich: the chart, the quarters, the years and the running sum.
  const MAX_COMPARE = 5
  /**
   * The quarter card carries its comparison on a second line under each sum,
   * so it holds two other years and no more — a third would either wrap that
   * line or shrink the figures it sits under.
   */
  const MAX_QUARTER_COMPARE = 2
  const chartMode: 'bars' | 'line' | 'linear' | 'area' =
    chartParam === 'line' || chartParam === 'linear' || chartParam === 'area' ? chartParam : 'bars'
  /**
   * The years worth comparing: those with a figure in them. A comparison
   * nobody chose is the year before only if that year has one; a year named in
   * the address is taken as named — and stays in the list so it can be unticked.
   */
  const filledYears = yearsWithData(comparisonYears, yearTotals ?? [])
  const compareYears = parseCompareYears(compareParam, year, compareParam === undefined ? filledYears : comparisonYears, MAX_COMPARE)
  const compareOptions = yearsWithData(comparisonYears, yearTotals ?? [], compareYears).filter((y) => y !== year)
  const tones = compareTones(year, comparisonYears)
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
                tone: tones.get(y),
              }
            : null
        })
        .filter((row) => row !== null)
    : []
  const monthsOfYear = (y: number): number[] =>
    y === year ? monthTotals : ((yearTotals ?? []).find((r) => r.year === y)?.months ?? []).map((m) => m.total)
  const quarterCompareYears = parseCompareYears(
    quarterCompareParam,
    quarterYear,
    quarterCompareParam === undefined ? filledYears : comparisonYears,
    MAX_QUARTER_COMPARE
  )
  const quarterCompareOptions = yearsWithData(comparisonYears, yearTotals ?? [], quarterCompareYears).filter((y) => y !== quarterYear)
  // The year the quarter card stands on: the ones with a figure, the page's own and the card's own.
  const quarterYearOptions = yearsWithData(comparisonYears, yearTotals ?? [], [year, quarterYear])
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
  /**
   * A bar is a way in: the month of its year on the Planumsatz tab, where the
   * jobs behind the figure stand one line each, every line a link to its
   * project. How that tab draws its months goes along.
   */
  const monthHrefs = Object.fromEntries(
    [year, ...compareYears].map((y) => [
      y,
      Array.from({ length: 12 }, (_, m) => {
        const query = new URLSearchParams({ tab: 'revenue', year: String(y), period: String(m + 1) })
        if (layoutParam) query.set('layout', layoutParam)
        if (perParam) query.set('per', perParam)
        return `/reports?${query.toString()}`
      }),
    ])
  )
  /**
   * The jobs behind every month of every year in the chart, in words: what a
   * click on a month lists under the chart. The year on screen comes from its
   * own loader, the compared ones from the year totals — the same loader, so a
   * month's list adds up to the month's bar.
   */
  const detailLine = (p: { key: string; id: string; number: string; name: string; customer: string; price: number | null; fromSheet?: boolean }): MonthDetailLine => ({
    key: p.key,
    number: p.number,
    name: p.name,
    customer: p.customer,
    amount: p.price != null ? money(p.price) : null,
    href: p.fromSheet ? null : `/projects/${p.id}`,
  })
  const monthDetails: Record<number, MonthDetailData[]> = onCompare
    ? Object.fromEntries(
        [year, ...compareYears].map((y) => {
          const row = (yearTotals ?? []).find((r) => r.year === y)
          const lines = y === year && revenue ? revenue.months.map((m) => ({ own: m.own, sub: m.sub })) : (row?.lines ?? [])
          // The largest first: what a month is made of is read from the top.
          const bySize = <T extends { price: number | null }>(list: T[]) => [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
          const sums = y === year && revenue ? revenue.months.map((m) => ({ own: m.ownTotal, sub: m.subTotal, total: m.total })) : (row?.months ?? [])
          return [
            y,
            Array.from({ length: 12 }, (_, m): MonthDetailData => ({
              own: bySize(lines[m]?.own ?? []).map(detailLine),
              sub: bySize(lines[m]?.sub ?? []).map(detailLine),
              ownTotal: money(sums[m]?.own ?? 0),
              subTotal: money(sums[m]?.sub ?? 0),
              total: money(sums[m]?.total ?? 0),
              totalValue: sums[m]?.total ?? 0,
              href: monthHrefs[y]?.[m] ?? '/reports?tab=revenue',
            })),
          ]
        })
      )
    : {}
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
  // The year on screen is always among them: a link can bring a year the six
  // do not hold, and a picker without it would show another year's name.
  const yearOptions = [...new Set([...comparisonYears, year])].sort((a, b) => b - a)
  const yearValue = (y: number) => (y === currentYear ? '' : String(y))
  /** What choosing a year takes along — only what the choice would change. */
  const yearCarry = Object.fromEntries(
    yearOptions.map((y) => {
      const carried = carriedCompare(y)
      const sets: Record<string, string> = {}
      if (carried.compare !== undefined && carried.compare !== compareParam) sets.compare = carried.compare
      // Choosing a year takes the quarter card along with it (`clears`).
      const quarter = carryCompareYears(quarterCompareParam, quarterYear, y)
      if (quarter !== undefined && quarter !== quarterCompareParam) sets.qcompare = quarter
      return [yearValue(y), sets]
    })
  )
  const quarterCarry = Object.fromEntries(
    comparisonYears.map((y) => {
      const carried = carryCompareYears(quarterCompareParam, quarterYear, y)
      const sets: Record<string, string> = {}
      if (carried !== undefined && carried !== quarterCompareParam) sets.qcompare = carried
      return [y === year ? '' : String(y), sets]
    })
  )
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
    ...(showFinancials ? [{ value: 'compare', label: t('tabCompare') }] : []),
    { value: 'jobs', label: t('tabJobs') },
    { value: 'pipeline', label: t('tabPipeline') },
    ...(showFinancials ? [{ value: 'revenue', label: t('tabPlan') }] : []),
    { value: 'utilization', label: t('tabUtilization') },
    { value: 'quality', label: t('tabGaps'), count: gaps.count },
  ]
  const tabLabel = tabs.find((x) => x.value === tab)?.label ?? t('tabPlan')
  const intro = onToday
    ? t('introToday')
    : tab === 'compare'
      ? t('introCompare')
      : onJobs
        ? t('introJobs')
        : onPipeline
          ? t('introPipeline')
        : tab === 'revenue'
          ? t('introPlan')
          : onUsage
            ? t('introUsage')
            : t('introGaps')
  const timeTab = tab === 'revenue' || tab === 'compare' || onUsage

  return (
    <div className="space-y-4">
      {/* Neither the sidebar nor the top bar is printed, so the sheet carries
          its own title: the tab and what time it stands for. */}
      <p className="hidden text-lg font-semibold tracking-tight print:block">
        {t('title')} · {tabLabel}
        <span className="ml-2 text-base font-normal text-muted">{timeTab ? frameLabel : standLabel}</span>
      </p>
      {/* Only the bar with the page's name stays at the top; the tabs scroll away
          with the page. */}
      <StickyHead>
        <div className={pageToolbar}>
          <h1 className={pageTitle}>{t('title')}</h1>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintButton label={t('print')} />
            {showFinancials && timeTab && (
              <a href={exportHref} className={btn.outlineSm}>
                {t('exportExcel')}
              </a>
            )}
          </div>
        </div>
      </StickyHead>

      {/* The tabs, and beside them the time the tab stands for: year and period
          where every figure follows them, the day otherwise. The two share one
          slot of one width and height, so the box keeps its size, and wraps at
          the same point, whichever tab is open. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-2 shadow-sm print:hidden">
        <ParamTabs ariaLabel={t('title')} tabs={tabs} clears={TAB_CHOICES} />
        <div className="flex min-h-9 items-center justify-end sm:min-w-[19rem]">
          {timeTab ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-subtle px-2 py-1">
              <CalendarRange className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <LiveSelect
                param="year"
                ariaLabel={t('year')}
                className="min-w-20"
                compact
                clears={['qyear']}
                value={yearValue(year)}
                carry={yearCarry}
                options={yearOptions.map((y) => ({ value: yearValue(y), label: String(y) }))}
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
        </div>
      </div>

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

      {/* ── Vergleich: the year against other years ───────── */}
      {onCompare && revenue && (
        <MonthDetailProvider>
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
                  <span className="ml-2 text-xs font-normal text-muted print:hidden">{t('chartClickHint')}</span>
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
                    options={compareOptions}
                    selected={compareYears}
                    max={MAX_COMPARE}
                    label={t('compareYears')}
                    maxHint={t('compareMax', { count: MAX_COMPARE })}
                    emptyHint={t('compareEmpty')}
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
                monthHrefs={monthHrefs}
                openLabel={t('chartOpenMonth')}
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
                    options={quarterYearOptions.map((y) => ({ value: y === year ? '' : String(y), label: String(y) }))}
                    carry={quarterCarry}
                    dense
                  />
                  <span className="text-xs text-muted">{t('quarterVersus')}</span>
                  <YearComparePicker
                    options={quarterCompareOptions}
                    emptyHint={t('compareEmpty')}
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

          {/* The jobs of the month that was clicked in the chart — right under it. */}
          <MonthDetailPanel
            data={monthDetails}
            // The chart's own order: newest first, the year on screen among the others.
            years={[year, ...compareYears].sort((a, b) => b - a)}
            baseYear={year}
            tones={Object.fromEntries(tones)}
            monthNames={monthNames.long}
          />

          {yearBars.length > 1 && (
            <div className={`${card} p-4`}>
              <h2 className="mb-3 text-sm font-semibold">{t('yearComparison')}</h2>
              <YearBars
                rows={yearBars}
                selected={year}
                hrefFor={(y) => reportHref({ year: y })}
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
        </MonthDetailProvider>
      )}

      {/* ── Aufträge & Baustellen ──────────────────────────── */}
      {onJobs && todayData && (
        <JobsView
          data={todayData}
          showFinancials={showFinancials}
          locale={locale}
          today={today}
          sitesView={sitesParam === 'kanban' ? 'kanban' : 'cards'}
        />
      )}

      {/* ── Pipeline: on the way to becoming a job ─────────── */}
      {onPipeline && pipeline && (
        <PipelineView columns={pipeline.columns} funnel={pipeline.funnel} showFinancials={showFinancials} locale={locale} year={currentYear} />
      )}

      {/* ── Planumsatz ───────────────────────────────────── */}
      {(tab === 'revenue' || tab === 'compare') && !showFinancials && (
        <p className={`${card} p-6 text-sm text-muted`}>{t('noAccess')}</p>
      )}
      {onRevenue && revenue && (
        <section className="space-y-3">
          {/* How the months are drawn, on the right above them. */}
          {orderedMonths.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
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

          {/* ── Monate ── */}
          {orderedMonths.length === 0 ? (
            <p className={`${card} p-6 text-sm text-muted`}>{t('noRevenueInPeriod')}</p>
          ) : monthsLayout.layout === 'lanes' ? (
            <RevenueLanes
              // Another year, period, order or layout opens the box on the
              // running month again, not wherever the last one was left.
              key={`lanes|${year}|${periodParam ?? ''}|${monthsDescending ? 'desc' : 'asc'}`}
              year={year}
              months={orderedMonths}
              density={monthsLayout.lanes}
              runningMonth={runningMonth}
              spans={new Map(siteRows.map((r) => [r.key, r.span]))}
              monthNames={monthNames}
              locale={locale}
            />
          ) : monthsLayout.layout === 'matrix' ? (
            <RevenueMatrix
              key={`matrix|${year}|${periodParam ?? ''}|${monthsDescending ? 'desc' : 'asc'}`}
              rows={siteRows}
              months={orderedMonths}
              density={monthsLayout.matrix}
              runningMonth={runningMonth}
              monthNames={monthNames}
              locale={locale}
            />
          ) : (
            <HoverGroups>
              <div className={`grid grid-cols-1 gap-3 ${GRID_COLUMNS[monthsLayout.grid]}`}>
                {/* Cards in one row share their rows (subgrid): the "Eigene Leute"
                    line, the SUB line and the rest sit at the same height in every
                    card beside each other, however long the lists above them are. */}
                {orderedMonths.map((m) => (
                  <DropMonth key={m.month} year={year} month={m.month} className={`grid grid-cols-[minmax(0,1fr)] grid-rows-subgrid row-span-6 ${card}`}>
                    <div
                      className={`flex items-center justify-between border-b border-border ${
                        denseCards ? 'flex-wrap gap-x-2 px-2 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'
                      }`}
                    >
                      <h3 className="font-semibold">{monthName(m.month)}</h3>
                      <span className="ml-auto font-semibold tabular-nums" title={exact(m.total)}>
                        {cardMoney(m.total)}
                      </span>
                    </div>
                    <div className={`${cardPad} pt-1.5 ${cardText}`}>{m.own.map((p) => siteLine(p, m.month))}</div>
                    <div
                      className={`${cardInset} mt-1 flex items-center justify-between self-end border-t border-border py-1 ${cardText} font-medium ${cardWrap}`}
                    >
                      <span className="flex items-center gap-1.5 italic">
                        {t('ownPeople')}
                        {hints && <InfoHint text={t('hintOwnPeople')} />}
                      </span>
                      <span className="ml-auto tabular-nums" title={exact(m.ownTotal)}>
                        {cardMoney(m.ownTotal)}
                      </span>
                    </div>
                    <div className={`${cardPad} ${cardText} ${m.sub.length > 0 ? 'pt-1' : ''}`}>{m.sub.map((p) => siteLine(p, m.month))}</div>
                    <div
                      className={`${cardInset} mt-1 flex items-center justify-between self-end border-t border-border py-1 ${cardText} font-medium ${cardWrap} ${
                        m.sub.length === 0 ? 'text-muted' : ''
                      }`}
                    >
                      <span className="flex items-center gap-1.5 italic">
                        {t('sub')}
                        {hints && <InfoHint text={t('hintSub')} />}
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
                            {!denseCards && <span className="text-muted">{money(plan!.months[m.month].total)}</span>}
                            <span
                              className={`font-medium ${planDelta(m.total, plan!.months[m.month].total).tone}`}
                              title={exact(plan!.months[m.month].total)}
                            >
                              {planDelta(m.total, plan!.months[m.month].total, cardMoney).label}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </DropMonth>
                ))}
              </div>
            </HoverGroups>
          )}

          {/* ── Planumsatz nach Stand, under the months for now ── */}
          {situationMonths && (
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
        </section>
      )}

      {/* ── Auslastung ───────────────────────────────────── */}
      {onUsage && usage && (
        <UsageView
          year={year}
          range={range}
          runningMonth={runningMonth}
          months={usage.months}
          covered={usage.covered}
          people={usage.people}
          vehicles={usage.vehicles}
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
