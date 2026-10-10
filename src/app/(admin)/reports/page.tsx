import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import {
  getCrewUsage,
  getDataGaps,
  getOpenOffers,
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
import { todayUtc } from '@/lib/dates'
import { RevenueChart } from '@/components/revenue-chart'
import { MonthDetailPanel, MonthDetailProvider, type MonthDetailData, type MonthDetailLine } from '@/components/month-detail'
import { ParamTabs } from '@/components/param-tabs'
import { PageBar, StickyHead } from '@/components/ui/page-panel'
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
import { monthSituations, monthlyAverage } from '@/lib/order-situation'
import { RevenueLanes } from './revenue-lanes'
import { MonthOrderToggle } from './month-order-toggle'
import { DragLine, DropMonth } from './month-drag'
import { OrderSituation } from './order-situation'
import { UsageView } from './usage-view'
import { GAP_KINDS, GapsView, type GapKind } from './gaps-view'
import { UnplacedJobs } from './unplaced-jobs'

const card = 'rounded-xl border border-border bg-surface'
const th = 'px-3 py-2 text-left text-[11px] font-medium text-muted'
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
  gap?: string
}

/**
 * Reporting (once called CRM): four tabs, each answering one question, each
 * with one time rule. The projects are where the work is run; this page only
 * reads what they add up to.
 *
 * - Vergleich (the default) — the year against other years: by month, by
 *   quarter, year by year and as a running sum. Every figure follows
 *   Jahr/Zeitraum.
 * - Planumsatz — what the year or period is worth month by month, and how
 *   sure it is. Every figure follows Jahr/Zeitraum.
 * - Auslastung — is the crew planned, and who and what stands idle.
 *   Every figure follows Jahr/Zeitraum.
 * - Datenlücken — what makes a figure wrong or incomplete. Stand heute.
 *
 * An address of a tab this page used to have is sent on to the tab that took
 * over its content (`src/lib/reports-url.ts`).
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
  // Vergleich is money from top to bottom; whoever may not see money starts
  // on Auslastung, keeping the year and period.
  if (tab === '' && !showFinancials) {
    const query = new URLSearchParams({ tab: 'utilization' })
    if (yearParam) query.set('year', yearParam)
    if (periodParam) query.set('period', periodParam)
    redirect(`/reports?${query.toString()}`)
  }
  // The years the comparison spans — the same six the year picker offers, so
  // every year in the chart can be opened from it.
  const comparisonYears = Array.from({ length: 6 }, (_, i) => currentYear + 1 - i)
  const onCompare = tab === '' && showFinancials
  const onRevenue = tab === 'revenue' && showFinancials
  const onUsage = tab === 'utilization'
  const onGaps = tab === 'quality'

  const [gaps, cutoff, revenue, prevRevenue, yearTotals, plan, openOffers, usage] = await Promise.all([
    // Every tab carries the Datenlücken count on its tab.
    getDataGaps(today),
    onGaps ? getHistoryCutoff() : null,
    // Planumsatz and Vergleich both stand on the year, the year before and the plan.
    onRevenue || onCompare ? getYearRevenueOrHistory(year) : null,
    onRevenue || onCompare ? getYearRevenueOrHistory(year - 1) : null,
    onCompare ? getYearTotals(comparisonYears) : null,
    onRevenue || onCompare ? getYearPlan(year) : null,
    onRevenue ? getOpenOffers() : null,
    onUsage ? getCrewUsage(year, range) : null,
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
  // Every month of the period for the cards and the lanes, an empty one too:
  // a job is dragged into a month that has nothing yet, so that month must
  // be there to drop it on.
  const periodMonths = revenue ? revenue.months.filter((m) => !range || (m.month >= range.from && m.month <= range.to)) : []
  const orderedPeriod = monthsDescending ? [...periodMonths].reverse() : periodMonths
  // The months as a grid of cards or as lanes, and each
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
  // The lanes count a site's months over every month they show; the grid over the months with something.
  const monthOrder = (monthsLayout.layout === 'lanes' ? orderedPeriod : orderedMonths).map((m) => m.month)
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
  const cardPad = denseCards ? 'px-2.5' : 'px-4'
  const cardText = denseCards ? 'text-xs' : 'text-[13px]'
  /** Whole euros on a dense card — the cents do not fit — with the exact figure on hover. */
  const cardMoney = (v: number | null) => (denseCards ? whole(v) : money(v))
  const exact = (v: number | null) => (denseCards ? money(v) : undefined)
  // The year's jobs without a month, as a column beside the cards and the
  // lanes to drag them from into a month.
  const unplaced = onRevenue && revenue ? revenue.undated : []
  const showMonths = orderedMonths.length > 0 || unplaced.length > 0
  /**
   * A site's line on a month card: its name, cut short with the whole of it on
   * hover, and its amount. A job over several months lights up in all of them
   * (`HoverGroups`). A project's line is dragged into another month and opens
   * the project; a line of the sheet has no project yet, stays where the sheet
   * has it and says so with a hollow mark and quieter type.
   */
  const siteLine = (p: SiteRow & { key: string }, month: number) => (
    <DragLine key={p.key} projectId={p.id} month={month} enabled={movable(p)} title={movable(p) ? t('dragLine') : undefined}>
      <div data-group={`sheet:${siteKey(p)}`} className={`flex items-center gap-2 rounded-sm py-[3px] ${LINE_LIGHTING}`}>
        {p.fromSheet ? (
          <>
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full border border-muted/70" />
            <span className="min-w-0 flex-1 truncate text-muted" title={`${p.name} · ${t('legendSheetLine')}`}>
              {p.name}
            </span>
          </>
        ) : (
          <>
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
            <Link href={`/projects/${p.id}`} title={p.name} className="min-w-0 flex-1 truncate hover:text-accent hover:underline">
              {p.name}
            </Link>
          </>
        )}
        <span className="shrink-0 tabular-nums text-muted" title={exact(p.price)}>
          {cardMoney(p.price)}
        </span>
      </div>
    </DragLine>
  )
  /**
   * The head of one of a card's two groups — own crew or SUB — with its sum:
   * the sum stands over the lines it adds up, where the eye starts, rather than
   * after them at a height that changes with every list.
   */
  const groupHead = (label: string, count: number, sum: number, hint: string) => (
    <div className={`flex items-center justify-between gap-2 ${cardText} font-medium ${count === 0 ? 'text-muted' : ''}`}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{label}</span>
        {count > 0 && !denseCards && <span className="text-[11px] font-normal tabular-nums text-muted">{count}</span>}
        {hints && <InfoHint text={hint} />}
      </span>
      <span className="shrink-0 tabular-nums" title={count > 0 ? exact(sum) : undefined}>
        {count > 0 ? cardMoney(sum) : '—'}
      </span>
    </div>
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
  /**
   * One bar per year with a figure in it. With a period chosen, every year
   * counts the same months — Q1 against Q1 — as the page says every figure
   * follows the period; the whole years stand in the chart above.
   */
  const yearBars = (yearTotals ?? [])
    .map((r) => {
      const months = range ? r.months.slice(range.from, range.to + 1) : r.months
      const sum = (pick: (m: { own: number; sub: number; total: number }) => number) =>
        Math.round(months.reduce((total, m) => total + pick(m), 0) * 100) / 100
      return { year: r.year, own: sum((m) => m.own), sub: sum((m) => m.sub), total: sum((m) => m.total) }
    })
    .filter((r) => r.total > 0 || r.year === year)
    .map((r, i, list) => ({ ...r, change: percentChange(r.total, list[i + 1]?.total) }))
  // The running sum stands against the year before only where that year has
  // a figure: against a year of nothing every month would read as all gain.
  const cumulativeRows =
    revenue && onCompare
      ? cumulativeMonths(
          revenue.months.map((m) => ({ month: m.month, total: m.total })),
          lastYearMonths ? lastYearMonths.map((total, month) => ({ month, total })) : null,
          range
        )
      : []
  const cumulativeAgainst = lastYearMonths !== null

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
    ...(showFinancials ? [{ value: '', label: t('tabCompare') }] : []),
    ...(showFinancials ? [{ value: 'revenue', label: t('tabPlan') }] : []),
    { value: 'utilization', label: t('tabUtilization') },
    { value: 'quality', label: t('tabGaps'), count: gaps.count },
  ]
  const tabLabel = tabs.find((x) => x.value === tab)?.label ?? t('tabPlan')
  const intro = onCompare
    ? t('introCompare')
    : tab === 'revenue'
      ? t('introPlan')
      : onUsage
        ? t('introUsage')
        : t('introGaps')
  const timeTab = tab === '' || tab === 'revenue' || onUsage

  return (
    <div className="space-y-4">
      {/* Neither the sidebar nor the top bar is printed, so the sheet carries
          its own title: the tab and what time it stands for. */}
      <p className="hidden text-lg font-semibold tracking-tight print:block">
        {t('title')} · {tabLabel}
        <span className="ml-2 text-base font-normal text-muted">{timeTab ? frameLabel : standLabel}</span>
      </p>
      {/* One row for the page: its name, its tabs, the time the tab stands
          for and what can be done with it. Year and period where every figure
          follows them, the day otherwise; the two share one slot of one
          width, so the row keeps its shape whichever tab is open. */}
      <StickyHead>
        <PageBar
          title={t('title')}
          tabs={
            // What the tab answers and how to read it, behind the "i" beside
            // the tabs rather than as a paragraph between the head and the cards.
            <div className="flex items-center gap-1.5">
              <ParamTabs ariaLabel={t('title')} tabs={tabs} clears={TAB_CHOICES} />
              <InfoHint text={intro} wide />
            </div>
          }
          actions={
            <>
              <div className="flex min-h-8 items-center justify-end print:hidden sm:min-w-[17rem]">
                {timeTab ? (
                  <div className="flex items-center gap-1.5">
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
                      className="min-w-36"
                      compact
                      options={periodOptions}
                    />
                  </div>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-muted" title={t('standHint')}>
                    <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
                    {standLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 print:hidden">
                {showFinancials && timeTab && (
                  <a href={exportHref} className={btn.outlineSm}>
                    {t('exportExcel')}
                  </a>
                )}
                <PrintButton label={t('print')} />
              </div>
            </>
          }
        />
      </StickyHead>


      {/* ── Vergleich: the year against other years ───────── */}
      {onCompare && revenue && (
        <MonthDetailProvider>
        <div className="space-y-4">
          {/* The two stretch to the same height, and the chart takes
              whatever height is left over inside its card. */}
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className={`${card} flex flex-col p-4`}>
              {/* The title on one line; how to read the chart and what a click
                  does are behind its "i", not written out beside it. */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                  <span className="truncate">{chartTitle}</span>
                  <InfoHint
                    text={compareYears.length > 0 ? `${t('chartCompareHint', { year })} ${t('chartClickHint')}` : t('chartClickHint')}
                    wide
                  />
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
              <h2 className="mb-3 text-sm font-semibold">
                {periodLabel ? t('yearComparisonPeriod', { period: periodLabel }) : t('yearComparison')}
              </h2>
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
              <h2 className="border-b border-border px-3 py-2.5 text-sm font-semibold">
                {cumulativeAgainst ? t('cumulativeTitle') : t('cumulativeTitleAlone')}
              </h2>
              <div className="overflow-x-auto">
                <table className={`w-full table-fixed text-sm ${cumulativeAgainst ? 'min-w-[720px]' : 'min-w-[420px]'}`}>
                  <colgroup>
                    <col />
                    <col className="w-36" />
                    <col className="w-36" />
                    {cumulativeAgainst && <col className="w-36" />}
                    {cumulativeAgainst && <col className="w-36" />}
                  </colgroup>
                  <thead className="border-b border-border bg-subtle">
                    <tr>
                      <th className={th}>{t('colMonth')}</th>
                      <th className={thR}>{t('colPlanRevenue')}</th>
                      <th className={thR}>{t('colCumulative')}</th>
                      {cumulativeAgainst && <th className={thR}>{t('colPrevCumulative', { year: year - 1 })}</th>}
                      {cumulativeAgainst && <th className={thR}>{t('colDelta')}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cumulativeRows.map((row) => (
                      <tr key={row.month}>
                        <td className={td}>{monthName(row.month)}</td>
                        <td className={`${tdR} text-muted`}>{money(row.total)}</td>
                        <td className={`${tdR} font-semibold`}>{money(row.running)}</td>
                        {cumulativeAgainst && (
                          <td className={`${tdR} text-muted`}>{row.prevRunning == null ? '—' : money(row.prevRunning)}</td>
                        )}
                        {cumulativeAgainst && (
                          <td className={`${tdR} font-medium ${row.delta == null ? 'text-muted' : row.delta >= 0 ? up : down}`}>
                            {row.delta == null ? '—' : `${row.delta >= 0 ? '+' : '−'}${money(Math.abs(row.delta))}`}
                          </td>
                        )}
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

      {/* ── Planumsatz ───────────────────────────────────── */}
      {tab === 'revenue' && !showFinancials && (
        <p className={`${card} p-6 text-sm text-muted`}>{t('noAccess')}</p>
      )}
      {onRevenue && revenue && (
        <section className="space-y-3">
          {/* How the months are drawn, on the right above them; on the left
              what the marks on a line mean. */}
          {orderedMonths.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent/60" />
                  {t('legendProjectLine')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-muted/70" />
                  {t('legendSheetLine')}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <MonthOrderToggle
                  descending={monthsDescending}
                  labels={{ asc: t('monthOrderAsc'), desc: t('monthOrderDesc') }}
                />
                <RevenueLayoutPicker
                  choice={monthsLayout}
                  labels={{
                    layout: t('monthLayout'),
                    layouts: { grid: t('layoutGrid'), lanes: t('layoutLanes') },
                    zoom: { grid: t('layoutPerRow'), lanes: t('layoutInView') },
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Monate ── */}
          <div className={unplaced.length > 0 ? 'grid grid-cols-1 items-start gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]' : ''}>
          {unplaced.length > 0 && (
            <UnplacedJobs
              jobs={unplaced.map((p) => ({
                id: p.id,
                number: p.number,
                name: p.name,
                customer: p.customer,
                amount: cardMoney(p.price),
                exact: exact(p.price),
              }))}
              total={money(revenue?.undatedTotal ?? 0)}
              labels={{ title: t('unplacedTitle'), hint: t('unplacedHint'), search: t('unplacedSearch'), noMatch: t('unplacedNoMatch'), drag: t('unplacedDrag') }}
            />
          )}
          <div className="min-w-0">
          {!showMonths ? (
            <p className={`${card} p-6 text-sm text-muted`}>{t('noRevenueInPeriod')}</p>
          ) : monthsLayout.layout === 'lanes' ? (
            <RevenueLanes
              // Another year, period, order or layout opens the box on the
              // running month again, not wherever the last one was left.
              key={`lanes|${year}|${periodParam ?? ''}|${monthsDescending ? 'desc' : 'asc'}`}
              year={year}
              months={orderedPeriod}
              density={monthsLayout.lanes}
              runningMonth={runningMonth}
              spans={new Map(siteRows.map((r) => [r.key, r.span]))}
              monthNames={monthNames}
              locale={locale}
            />
          ) : (
            <HoverGroups>
              <div className={`grid grid-cols-1 gap-3 ${GRID_COLUMNS[monthsLayout.grid]}`}>
                {/* Every month of the period, an empty one too: a job is dragged
                    into a month that has nothing yet, so that month must be
                    there to drop it on. */}
                {orderedPeriod.map((m) => {
                  const planned = planComparable ? plan!.months[m.month].total : 0
                  const delta = planned > 0 ? planDelta(m.total, planned, cardMoney) : null
                  const running = m.month === runningMonth
                  // An empty month is drawn lighter: it is there to take a job, not to be read.
                  const empty = m.own.length === 0 && m.sub.length === 0 && (plan?.months[m.month].total ?? 0) === 0
                  return (
                    <DropMonth
                      key={m.month}
                      year={year}
                      month={m.month}
                      className={`flex flex-col ${card} ${running ? 'ring-2 ring-accent/30' : ''} ${empty ? 'border-dashed bg-surface/60 text-muted' : ''}`}
                    >
                      {/* The month and its sum, and under them how far the
                          month has come against the plan. */}
                      <div className={`space-y-2 border-b border-border ${denseCards ? 'px-2.5 py-2' : 'px-4 py-3'}`}>
                        <div className={`flex items-baseline justify-between gap-2 ${denseCards ? 'flex-wrap' : ''}`}>
                          <h3 className={`flex items-center gap-2 font-semibold ${denseCards ? 'text-[13px]' : 'text-sm'}`}>
                            {monthName(m.month)}
                            {running && (
                              <span className="rounded-full bg-accent/10 px-1.5 py-px text-[10px] font-medium text-accent">
                                {t('quarterRunning')}
                              </span>
                            )}
                          </h3>
                          <span
                            className={`ml-auto font-semibold tabular-nums tracking-tight ${denseCards ? 'text-sm' : 'text-lg'}`}
                            title={exact(m.total)}
                          >
                            {cardMoney(m.total)}
                          </span>
                        </div>
                        {delta && (
                          <div className="space-y-1">
                            <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                              <div
                                className={`h-full rounded-full ${delta.tone === up ? 'bg-emerald-500/80' : 'bg-accent/70'}`}
                                style={{ width: `${Math.min(100, (m.total / planned) * 100)}%` }}
                              />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] text-muted">
                              <span className="flex items-center gap-1">
                                {t('planned')} <span className="tabular-nums">{cardMoney(planned)}</span>
                                {hints && <InfoHint text={t('hintPlan')} />}
                              </span>
                              <span className={`font-medium tabular-nums ${delta.tone}`} title={exact(planned)}>
                                {delta.label}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={`flex flex-1 flex-col gap-3 ${cardPad} ${denseCards ? 'py-2' : 'py-3'}`}>
                        <div>
                          {groupHead(t('ownPeople'), m.own.length, m.ownTotal, t('hintOwnPeople'))}
                          {m.own.length > 0 && <div className={`mt-1 ${cardText}`}>{m.own.map((p) => siteLine(p, m.month))}</div>}
                        </div>
                        <div className="border-t border-dashed border-border pt-3">
                          {groupHead(t('sub'), m.sub.length, m.subTotal, t('hintSub'))}
                          {m.sub.length > 0 && <div className={`mt-1 ${cardText}`}>{m.sub.map((p) => siteLine(p, m.month))}</div>}
                        </div>
                      </div>
                    </DropMonth>
                  )
                })}
              </div>
            </HoverGroups>
          )}
          </div>
          </div>

          {/* ── Planumsatz nach Stand, under the months ── */}
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
          range={range}
          runningMonth={runningMonth}
          months={usage.months}
          spanLabel={usage.window ? `${formatDate(usage.window.start, locale)} – ${formatDate(usage.window.end, locale)}` : null}
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
          focus={(GAP_KINDS as readonly string[]).includes(params.gap ?? '') ? (params.gap as GapKind) : null}
        />
      )}
    </div>
  )
}
