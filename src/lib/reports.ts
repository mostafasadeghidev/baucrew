import 'server-only'
import { db } from './db'
import { computeEfficiency, type EfficiencyResult, type MonthRange } from './reports-calc'
import { stockShortage } from './stock'
import { sumMinutes } from './time-entries'
import { planTotals, type PlanEntry } from './year-plan-excel'
import { isHistorical, projectHistoryDate } from './history'
import {
  crewUsage,
  openMoneyOf,
  type CrewMonth,
  type OpenMoney,
  type UsageLoad,
  type UsageWindow,
} from './order-situation'
import { crewDays, type CrewDay } from './cockpit'
import { dataGapReport, type GapReport } from './data-gaps'
import { getHistoryCutoff } from './history-db'
import { MAX_PLAN_MONTHS, monthSpan, spreadAmount } from './plan-month'

export type RevenueProject = {
  /** Unique per row: a project may stand in a month with several sheet lines. */
  key: string
  /** The project's id — a sheet line without a project carries the line's id. */
  id: string
  number: string
  name: string
  customer: string
  price: number | null
  /** True for a line of the planning sheet that no project is tied to — it has no project page. */
  fromSheet?: boolean
  /** The customer's id; absent for a sheet line with no project. */
  customerId?: string
  /** The status of the project behind the line; absent for a sheet line with none. */
  status?: string
  /** True when that project is old data — finished before the history cutoff, nobody's to bill any more. */
  settled?: boolean
}

export type MonthRevenue = {
  month: number // 0-11
  own: RevenueProject[]
  sub: RevenueProject[]
  ownTotal: number
  subTotal: number
  total: number
}

export type YearRevenue = {
  year: number
  months: MonthRevenue[]
  yearTotal: number
  /**
   * Projects without a month — no planned start and no placing. They belong
   * to no month, so they are listed on their own instead of being filed
   * under whatever month they happened to be entered in. Not counted in
   * yearTotal.
   */
  undated: RevenueProject[]
  undatedTotal: number
  /**
   * Undated projects left out of `undated` because they are old data —
   * finished before the day named in Settings. Counted, never silently
   * dropped: the card says how many there are.
   */
  undatedHistorical: number
  /**
   * True when the planning sheet was imported for the year: its lines that
   * no project has taken over yet stand in the months beside the projects.
   */
  sheetLed: boolean
  /**
   * True when the year is the sheet alone: no project in any month, none
   * undated — the years the company ran before BauCrew existed.
   */
  fromSheet: boolean
}

/**
 * The "Monatsplanumsatz" of a year: every project in the months it runs in,
 * with its order value spread over them (src/lib/plan-month.ts) — own-crew
 * work and SUB (subcontractor) work apart. A job with a planned start stands
 * in that month; one without in the month the office placed it in; one with a
 * planned end, or a duration, runs over every month to it. That is what the
 * office reads as the year's turnover, and moving a job into another month is
 * what changes it.
 *
 * Where the planning sheet has been imported for the year, its lines that
 * belong to no project yet stand in their months as well — work planned that
 * nobody has made a project for — and go once a project takes them over in
 * the Planabgleich. A project without a month is not guessed into one — the
 * day it was typed in says nothing about when the work happens — but listed
 * as "undated".
 */
/** The statuses of a job still ahead: offered, agreed, planned or under way. */
const OPEN_STATUSES = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS'] as const

export async function getYearRevenue(year: number): Promise<YearRevenue> {
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year + 1, 0, 1))
  // A job may run into the year from as far back as it can be spread.
  const earliest = new Date(Date.UTC(year - Math.ceil(MAX_PLAN_MONTHS / 12), 0, 1))

  // The sheet's lines nobody has a project for — or whose project was cancelled.
  const [lines, sheetLines] = await Promise.all([
    db.planEntry.findMany({
      where: { year, month: { not: null }, OR: [{ projectId: null }, { project: { status: 'CANCELLED' } }] },
      orderBy: [{ month: 'asc' }, { name: 'asc' }],
      select: { id: true, month: true, name: true, amount: true, isSub: true },
    }),
    db.planEntry.count({ where: { year, month: { not: null } } }),
  ])

  // A job still open that nobody has given a month stands in this year's
  // undated list, whichever year it was typed in — it is waiting to be placed
  // now, not last year.
  const waiting =
    year === new Date().getUTCFullYear()
      ? [{ plannedStart: null, planMonth: null, createdAt: { lt: start }, archivedAt: null, status: { in: [...OPEN_STATUSES] } }]
      : []
  const projects = await db.project.findMany({
    where: {
      status: { not: 'CANCELLED' },
      OR: [
        { plannedStart: { gte: earliest, lt: end } },
        { plannedStart: null, planMonth: { gte: earliest, lt: end } },
        { plannedStart: null, planMonth: null, createdAt: { gte: start, lt: end } },
        ...waiting,
      ],
    },
    select: {
      id: true,
      number: true,
      name: true,
      price: true,
      isSub: true,
      status: true,
      plannedStart: true,
      plannedEnd: true,
      planMonth: true,
      planMonths: true,
      // The dates that say whether the project is old data.
      actualStart: true,
      actualEnd: true,
      sourceCreatedAt: true,
      createdAt: true,
      archivedAt: true,
      customer: { select: { id: true, name: true } },
      addOns: { select: { amount: true } },
    },
    orderBy: { number: 'asc' },
  })

  const months: MonthRevenue[] = Array.from({ length: 12 }, (_, month) => ({
    month,
    own: [],
    sub: [],
    ownTotal: 0,
    subTotal: 0,
    total: 0,
  }))
  const put = (bucket: MonthRevenue, entry: RevenueProject, isSub: boolean) => {
    if (isSub) {
      bucket.sub.push(entry)
      bucket.subTotal += entry.price ?? 0
    } else {
      bucket.own.push(entry)
      bucket.ownTotal += entry.price ?? 0
    }
  }

  for (const line of lines) {
    put(
      months[line.month! - 1],
      { key: line.id, id: line.id, number: '', name: line.name, customer: '', price: Number(line.amount), fromSheet: true },
      line.isSub
    )
  }

  const undated: RevenueProject[] = []
  // Old data: work finished before the day the office named in Settings. It
  // is nobody's job to date it any more, so it is set aside from the undated
  // list — and counted, so the card can say how much was set aside.
  const cutoff = await getHistoryCutoff()
  let undatedHistorical = 0

  for (const p of projects) {
    const span = monthSpan(p)
    const value = orderValue(p.price, p.addOns)
    const settled = isHistorical(p, cutoff)
    if (span.length === 0) {
      if (settled) undatedHistorical++
      // An archived job was put away on purpose; it is waiting for no month.
      else if (p.archivedAt === null)
        undated.push({
          key: p.id,
          id: p.id,
          number: p.number,
          name: p.name,
          customer: p.customer.name,
          customerId: p.customer.id,
          price: value,
          status: p.status,
        })
      continue
    }
    // The value in equal shares, one per month the job runs; a month of
    // another year counts in that year.
    const shares = value === null ? null : spreadAmount(value, span.length)
    span.forEach((k, i) => {
      if (k.year !== year) return
      put(
        months[k.month],
        {
          key: `${p.id}:${k.month}`,
          id: p.id,
          number: p.number,
          name: p.name,
          customer: p.customer.name,
          customerId: p.customer.id,
          price: shares ? shares[i] : null,
          status: p.status,
          ...(settled ? { settled: true } : {}),
        },
        p.isSub
      )
    })
  }

  // The shares are exact cents; the sums are rounded to cents once, at the end.
  const cents = (v: number) => Math.round(v * 100) / 100
  for (const m of months) {
    m.ownTotal = cents(m.ownTotal)
    m.subTotal = cents(m.subTotal)
    m.total = cents(m.ownTotal + m.subTotal)
  }

  const sheetLed = sheetLines > 0
  const nothingButSheet =
    sheetLed &&
    months.every((m) => [...m.own, ...m.sub].every((e) => e.fromSheet)) &&
    undated.length === 0 &&
    undatedHistorical === 0

  return {
    year,
    months,
    yearTotal: cents(months.reduce((sum, m) => sum + m.total, 0)),
    undated,
    undatedTotal: undated.reduce((sum, p) => sum + (p.price ?? 0), 0),
    undatedHistorical,
    sheetLed,
    fromSheet: nothingButSheet,
  }
}

/** Kept for callers: a year's revenue is built the same way whether or not it has a sheet. */
export const getYearRevenueOrHistory = getYearRevenue

export type YearTotal = {
  year: number
  own: number
  sub: number
  total: number
  /**
   * The twelve months, own crew and SUB apart, so a chart can lay years over
   * each other and still show each one's split.
   */
  months: Array<{ own: number; sub: number; total: number }>
  /** The lines behind each month — what a click on the month in the chart lists. */
  lines: Array<{ own: RevenueProject[]; sub: RevenueProject[] }>
  /** True when the figures are the imported planning sheet's own lines. */
  sheetLed: boolean
}

/**
 * One line per year for the year comparison. Built from the very loader the
 * month cards read, so the comparison and the months can never say two
 * different things about the same year — a sheet-led year counts its sheet
 * lines here exactly as it does there.
 */
export async function getYearTotals(years: number[]): Promise<YearTotal[]> {
  const revenues = await Promise.all(years.map((y) => getYearRevenue(y)))
  return revenues.map((r) => ({
    year: r.year,
    own: r.months.reduce((sum, m) => sum + m.ownTotal, 0),
    sub: r.months.reduce((sum, m) => sum + m.subTotal, 0),
    total: r.yearTotal,
    months: r.months.map((m) => ({ own: m.ownTotal, sub: m.subTotal, total: m.total })),
    lines: r.months.map((m) => ({ own: m.own, sub: m.sub })),
    sheetLed: r.sheetLed,
  }))
}

export type YearPlan = {
  year: number
  /** Index 0-11, same shape as `MonthRevenue`, so both line up in the UI. */
  months: Array<{ own: number; sub: number; total: number }>
  /** Sites promised for that year with no month picked yet. */
  open: number
  yearTotal: number
  /** False when nothing has been imported for this year. */
  hasPlan: boolean
}

/** The planned figures for a year, as imported from the planning sheet. */
export async function getYearPlan(year: number): Promise<YearPlan> {
  const rows = await db.planEntry.findMany({
    where: { year },
    select: { year: true, month: true, name: true, amount: true, isSub: true },
  })
  const entries: PlanEntry[] = rows.map((r) => ({
    year: r.year,
    month: r.month,
    name: r.name,
    amount: Number(r.amount),
    isSub: r.isSub,
  }))
  const totals = planTotals(entries, year)
  return {
    year,
    months: totals.months.map((m) => ({ own: m.own, sub: m.sub, total: m.total })),
    open: totals.open,
    yearTotal: totals.yearTotal,
    hasPlan: rows.length > 0,
  }
}

export type PlanGap = {
  id: string
  month: number | null
  name: string
  amount: number
  isSub: boolean
}

/**
 * Planned sites of a year that are not tied to any project — the honest answer
 * to "what did we promise that never made it into the system?".
 */
export async function getPlanGaps(year: number): Promise<{ rows: PlanGap[]; total: number }> {
  const rows = await db.planEntry.findMany({
    where: { year, projectId: null },
    orderBy: [{ month: 'asc' }, { name: 'asc' }],
    select: { id: true, month: true, name: true, amount: true, isSub: true },
  })
  const mapped = rows.map((r) => ({ ...r, amount: Number(r.amount) }))
  return { rows: mapped, total: mapped.reduce((sum, r) => sum + r.amount, 0) }
}

/** Years that have an imported plan — for the year picker and the import page. */
export async function getPlanYears(): Promise<Array<{ year: number; entries: number }>> {
  const grouped = await db.planEntry.groupBy({
    by: ['year'],
    _count: { _all: true },
    orderBy: { year: 'desc' },
  })
  return grouped.map((g) => ({ year: g.year, entries: g._count._all }))
}

/**
 * Order value of a project: the contract price plus every accepted follow-on
 * offer ("Nachtrag"). Reports must use this, otherwise the figures never match
 * the numbers the office has.
 */
export function orderValue(
  price: unknown,
  addOns: Array<{ amount: unknown }> | undefined
): number | null {
  const base = price != null ? Number(price) : null
  const extra = (addOns ?? []).reduce((sum, a) => sum + Number(a.amount), 0)
  if (base == null) return extra > 0 ? extra : null
  return base + extra
}

export function periodRange(year: number, range?: MonthRange | null): { start: Date; end: Date } {
  if (!range) return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) }
  return { start: new Date(Date.UTC(year, range.from, 1)), end: new Date(Date.UTC(year, range.to + 1, 1)) }
}

/** One offer that is out and still waiting for the customer's confirmation. */
export type OpenOffer = {
  id: string
  number: string
  name: string
  customer: string
  price: number | null
  /** Days since the offer was created in BauCrew. */
  ageDays: number
  plannedStart: Date | null
  /** The month the office placed it in, when no start is fixed. */
  planMonth: Date | null
}

/**
 * Offers waiting for confirmation, oldest first — the list behind the
 * "offers" bucket. `staleAfterDays` marks the ones to chase.
 */
export async function getOpenOffers(): Promise<{ offers: OpenOffer[]; total: number; staleCount: number }> {
  const rows = await db.project.findMany({
    where: { status: 'QUOTED' },
    select: {
      id: true,
      number: true,
      name: true,
      price: true,
      createdAt: true,
      plannedStart: true,
      planMonth: true,
      customer: { select: { name: true } },
      addOns: { select: { amount: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const now = Date.now()
  const offers = rows.map((r) => ({
    id: r.id,
    number: r.number,
    name: r.name,
    customer: r.customer.name,
    price: orderValue(r.price, r.addOns),
    ageDays: Math.max(0, Math.floor((now - r.createdAt.getTime()) / 86_400_000)),
    plannedStart: r.plannedStart,
    planMonth: r.planMonth,
  }))
  return {
    offers,
    total: offers.reduce((sum, o) => sum + (o.price ?? 0), 0),
    staleCount: offers.filter((o) => o.ageDays >= STALE_OFFER_DAYS).length,
  }
}

/** An offer older than this without an answer is worth chasing. */
export const STALE_OFFER_DAYS = 21

// ── Money earned and not yet in ──────────────────────────────

/** Finished work not billed and bills not paid — the rules are `openMoneyOf`'s. */
export async function getOpenMoney(): Promise<OpenMoney> {
  const [projects, cutoff] = await Promise.all([
    db.project.findMany({
      where: { status: { in: ['COMPLETED', 'INVOICED'] } },
      select: {
        id: true,
        number: true,
        name: true,
        status: true,
        price: true,
        plannedStart: true,
        plannedEnd: true,
        actualStart: true,
        actualEnd: true,
        sourceCreatedAt: true,
        customer: { select: { name: true } },
        addOns: { select: { amount: true } },
      },
    }),
    getHistoryCutoff(),
  ])
  return openMoneyOf(
    projects.map(({ customer, price, addOns, ...p }) => ({
      ...p,
      customer: customer.name,
      amount: orderValue(price, addOns),
    })),
    cutoff
  )
}

/** The weekdays from `start` to `end`, each with the people on the schedule — the rules are `crewDays`. */
export async function getCrewDays(start: Date, end: Date): Promise<CrewDay[]> {
  const [bookings, absences] = await Promise.all([
    db.scheduleEntryEmployee.findMany({
      where: { scheduleEntry: { date: { gte: start, lte: end }, cancelledAt: null } },
      select: { employeeId: true, scheduleEntry: { select: { date: true } } },
    }),
    db.absence.findMany({
      where: { startDate: { lte: end }, endDate: { gte: start } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ])
  return crewDays(
    bookings.map((b) => ({ employeeId: b.employeeId, date: b.scheduleEntry.date })),
    absences,
    start,
    end
  )
}

// ── Project efficiency: plan vs. actual for finished projects ─

export type EfficiencyRow = EfficiencyResult & {
  id: string
  number: string
  name: string
  customer: string
  price: number | null
  /** Recorded working minutes from the time tracking (closed intervals). */
  recordedMinutes: number
  /** Order value per recorded hour — null without price or hours. */
  revenuePerHour: number | null
}

/**
 * Finished jobs of a period, with planned against actual days from the
 * schedule and the order value per person-day.
 *
 * A job belongs to the period it was finished in — when it ended, or was meant
 * to — not to the day it was typed in, which for an import is the day of the
 * import. Old data before the history cutoff is left out and counted, so the
 * table shows the office's recent work rather than its archive.
 */
export async function getProjectEfficiency(
  year: number,
  range?: MonthRange | null
): Promise<{
  rows: EfficiencyRow[]
  avg: { plannedDays: number | null; actualDays: number | null; revenuePerPersonDay: number | null; delayDays: number | null }
  /** Finished jobs of the period from before the history cutoff, left out of the rows. */
  hiddenHistorical: number
  /** Finished jobs with no date at all: they belong to no period, so they are counted instead. */
  undated: number
}> {
  const { start, end } = periodRange(year, range)
  const [finished, cutoff] = await Promise.all([
    db.project.findMany({
      where: { status: { in: ['COMPLETED', 'INVOICED', 'PAID'] } },
      select: {
        id: true,
        number: true,
        name: true,
        status: true,
        price: true,
        plannedStart: true,
        plannedEnd: true,
        actualStart: true,
        actualEnd: true,
        sourceCreatedAt: true,
        customer: { select: { name: true } },
        addOns: { select: { amount: true } },
        scheduleEntries: {
          where: { cancelledAt: null },
          select: { date: true, _count: { select: { employees: true } } },
        },
        timeEntries: {
          where: { endedAt: { not: null } },
          select: { startedAt: true, endedAt: true },
        },
      },
      orderBy: { number: 'desc' },
    }),
    getHistoryCutoff(),
  ])
  const inPeriod = finished.filter((p) => {
    const filed = projectHistoryDate(p)
    return filed !== null && filed >= start && filed < end
  })
  const projects = inPeriod.filter((p) => !isHistorical(p, cutoff))
  const hiddenHistorical = inPeriod.length - projects.length
  const undated = finished.filter((p) => projectHistoryDate(p) === null).length

  const rows: EfficiencyRow[] = projects.map((p) => {
    const price = orderValue(p.price, p.addOns)
    const recordedMinutes = sumMinutes(p.timeEntries, new Date())
    return {
    id: p.id,
    number: p.number,
    name: p.name,
    customer: p.customer.name,
    price,
    recordedMinutes,
    revenuePerHour:
      price != null && recordedMinutes >= 30 ? Math.round(price / (recordedMinutes / 60)) : null,
    ...computeEfficiency({
      price: orderValue(p.price, p.addOns),
      plannedStart: p.plannedStart,
      plannedEnd: p.plannedEnd,
      actualStart: p.actualStart,
      actualEnd: p.actualEnd,
      entries: p.scheduleEntries.map((e) => ({ date: e.date, employeeCount: e._count.employees })),
    }),
    }
  })

  const avgOf = (vals: Array<number | null>) => {
    const xs = vals.filter((v): v is number => v != null)
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null
  }
  return {
    rows,
    avg: {
      plannedDays: avgOf(rows.map((r) => r.plannedDays)),
      actualDays: avgOf(rows.filter((r) => r.actualDays > 0).map((r) => r.actualDays)),
      // Weighted: total contract value ÷ total person-days (plain mean would let tiny projects dominate)
      revenuePerPersonDay: (() => {
        const xs = rows.filter((r) => r.price != null && r.personDays > 0)
        const pd = xs.reduce((a, r) => a + r.personDays, 0)
        return pd > 0 ? Math.round(xs.reduce((a, r) => a + (r.price ?? 0), 0) / pd) : null
      })(),
      delayDays: avgOf(rows.map((r) => r.delayDays)),
    },
    hiddenHistorical,
    undated,
  }
}

// ── Customers: revenue share + inactive customers ────────────

export type CustomerRow = { id: string; name: string; revenue: number; projects: number; share: number }

export async function getCustomerReport(
  year: number,
  range?: MonthRange | null
): Promise<{
  top: CustomerRow[]
  total: number
  /** Customers whose last non-cancelled project (planned start / creation) is older than 12 months, or who never had one. */
  inactive: Array<{ id: string; name: string; lastProject: Date | null }>
}> {
  const { start, end } = periodRange(year, range)
  const projects = await db.project.findMany({
    where: {
      status: { not: 'CANCELLED' },
      OR: [
        { plannedStart: { gte: start, lt: end } },
        { plannedStart: null, createdAt: { gte: start, lt: end } },
      ],
    },
    select: {
      price: true,
      addOns: { select: { amount: true } },
      customer: { select: { id: true, name: true } },
    },
  })
  const byCustomer = new Map<string, CustomerRow>()
  let total = 0
  for (const p of projects) {
    const row =
      byCustomer.get(p.customer.id) ?? { id: p.customer.id, name: p.customer.name, revenue: 0, projects: 0, share: 0 }
    const value = orderValue(p.price, p.addOns) ?? 0
    row.revenue += value
    row.projects += 1
    total += value
    byCustomer.set(p.customer.id, row)
  }
  const top = [...byCustomer.values()]
    .map((r) => ({ ...r, share: total > 0 ? Math.round((r.revenue / total) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue || b.projects - a.projects || a.name.localeCompare(b.name))
    .slice(0, 12)

  const cutoff = new Date()
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)
  const customers = await db.customer.findMany({
    select: {
      id: true,
      name: true,
      projects: {
        where: { status: { not: 'CANCELLED' } },
        select: { plannedStart: true, createdAt: true },
      },
    },
    orderBy: { name: 'asc' },
  })
  const inactive = customers
    .map((c) => {
      const last = c.projects.reduce<Date | null>((acc, p) => {
        const d = p.plannedStart ?? p.createdAt
        return !acc || d > acc ? d : acc
      }, null)
      return { id: c.id, name: c.name, lastProject: last }
    })
    .filter((c) => !c.lastProject || c.lastProject < cutoff)
    .sort((a, b) => (a.lastProject?.getTime() ?? 0) - (b.lastProject?.getTime() ?? 0))
  return { top, total, inactive }
}

export type StockShortage = { id: string; name: string; unit: string | null; need: number; stock: number }

/**
 * Catalog items whose stock is lower than the open (not yet packed) demand of
 * active projects. Warning only — see `stockShortage`.
 */
export async function getStockShortages(): Promise<StockShortage[]> {
  const demand = await db.projectItem.groupBy({
    by: ['catalogItemId'],
    where: {
      status: { in: ['REQUIRED', 'MISSING'] },
      quantity: { not: null },
      project: { status: { in: ['PLANNED', 'IN_PROGRESS', 'APPROVED'] } },
    },
    _sum: { quantity: true },
  })
  const demandIds = demand.map((d) => d.catalogItemId)
  if (demandIds.length === 0) return []
  const stockRows = await db.catalogItem.findMany({
    where: { id: { in: demandIds }, stockQuantity: { not: null } },
    select: { id: true, name: true, unit: true, stockQuantity: true },
  })
  const demandFor = new Map(demand.map((d) => [d.catalogItemId, Number(d._sum.quantity ?? 0)]))
  return stockRows
    .map((c) => {
      const need = demandFor.get(c.id) ?? 0
      const short = stockShortage(need, Number(c.stockQuantity))
      return short == null ? null : { id: c.id, name: c.name, unit: c.unit, need, stock: Number(c.stockQuantity) }
    })
    .filter((x): x is StockShortage => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── Datenlücken: what makes a figure wrong or incomplete ──────────

/**
 * The Datenlücken tab's data, and the one count shown wherever data gaps are
 * counted. The rules are in `src/lib/data-gaps.ts`, where they are tested.
 */
export async function getDataGaps(today: Date): Promise<GapReport> {
  const [projects, loose, cutoff] = await Promise.all([
    db.project.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: {
        id: true,
        number: true,
        name: true,
        status: true,
        price: true,
        isSub: true,
        plannedStart: true,
        plannedEnd: true,
        planMonth: true,
        city: true,
        actualStart: true,
        actualEnd: true,
        sourceCreatedAt: true,
        customer: { select: { name: true } },
        addOns: { select: { amount: true } },
        planEntries: { select: { year: true, amount: true, isSub: true } },
      },
      orderBy: { number: 'desc' },
    }),
    // A line belongs to no job when none is tied, or the one tied was cancelled.
    db.planEntry.findMany({
      where: { OR: [{ projectId: null }, { project: { status: 'CANCELLED' } }] },
      select: { id: true, year: true, month: true, name: true, amount: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }, { name: 'asc' }],
    }),
    getHistoryCutoff(),
  ])

  return dataGapReport(
    projects.map((p) => ({
      id: p.id,
      number: p.number,
      name: p.name,
      customer: p.customer.name,
      status: p.status,
      amount: orderValue(p.price, p.addOns),
      plannedStart: p.plannedStart,
      planMonth: p.planMonth,
      city: p.city,
      isSub: p.isSub,
      historical: isHistorical(p, cutoff),
      lines: p.planEntries.map((l) => ({ year: l.year, amount: Number(l.amount), isSub: l.isSub })),
    })),
    loose.map((l) => ({ id: l.id, year: l.year, month: l.month, name: l.name, amount: Number(l.amount) })),
    { currentYear: today.getUTCFullYear(), runningMonth: today.getUTCMonth() },
  )
}

// ── Auslastung: how booked the crew and the vehicles are ─────────

export type NamedUsage = UsageLoad & { name: string }

/**
 * The Auslastung tab's data: the crew's planned share month by month, and each
 * person and vehicle over the chosen period. The rules are `crewUsage` in
 * `src/lib/order-situation.ts`.
 */
export async function getCrewUsage(
  year: number,
  range: MonthRange | null
): Promise<{ window: UsageWindow | null; months: CrewMonth[]; people: NamedUsage[]; vehicles: NamedUsage[] }> {
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year + 1, 0, 1))
  const onSchedule = { scheduleEntry: { date: { gte: start, lt: end }, cancelledAt: null } }
  const [bookings, vehicleBookings, absences, employees, vehicles] = await Promise.all([
    db.scheduleEntryEmployee.findMany({
      where: onSchedule,
      select: { employeeId: true, scheduleEntry: { select: { date: true } } },
    }),
    db.scheduleEntryVehicle.findMany({
      where: onSchedule,
      select: { vehicleId: true, scheduleEntry: { select: { date: true } } },
    }),
    db.absence.findMany({
      where: { startDate: { lt: end }, endDate: { gte: start } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
    db.employee.findMany({ select: { id: true, firstName: true, lastName: true } }),
    db.vehicle.findMany({ select: { id: true, name: true, active: true } }),
  ])

  const months = range
    ? Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i)
    : Array.from({ length: 12 }, (_, i) => i)
  const people = bookings.map((b) => ({ employeeId: b.employeeId, date: b.scheduleEntry.date }))
  const usage = crewUsage(
    year,
    months,
    people,
    absences,
    vehicleBookings.map((b) => ({ vehicleId: b.vehicleId, date: b.scheduleEntry.date })),
    // Every vehicle still in use has a row, an idle one too.
    vehicles.filter((v) => v.active).map((v) => v.id)
  )
  const personName = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]))
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]))
  const byName = (a: NamedUsage, b: NamedUsage) => (b.pct ?? -1) - (a.pct ?? -1) || a.name.localeCompare(b.name)
  return {
    window: usage.window,
    months: usage.months,
    people: usage.people.map((u) => ({ ...u, name: personName.get(u.id) ?? '' })).sort(byName),
    vehicles: usage.vehicles.map((u) => ({ ...u, name: vehicleName.get(u.id) ?? '' })).sort(byName),
  }
}
