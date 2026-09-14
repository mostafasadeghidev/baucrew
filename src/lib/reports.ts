import 'server-only'
import { db } from './db'
import { computeEfficiency, type EfficiencyResult, type MonthRange } from './reports-calc'
import { stockShortage } from './stock'
import { sumMinutes } from './time-entries'
import { planTotals, type PlanEntry } from './year-plan-excel'
import { isHistorical, projectHistoryDate } from './history'
import {
  crewLoadByMonth,
  crewUsage,
  openMoneyOf,
  type CrewMonth,
  type OpenMoney,
  type UsageLoad,
} from './order-situation'
import {
  crewDays,
  overdueOf,
  siteGroupOf,
  sitesToday,
  type CrewDay,
  type Overdue,
  type SiteCrew,
  type SiteGroup,
} from './cockpit'
import { dataGapReport, type GapReport } from './data-gaps'
import { getHistoryCutoff } from './history-db'

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
  /**
   * Projects that start in this month but stand nowhere in the sheet. Shown
   * so nothing is hidden, not counted in `total`, so the month reads as the
   * sheet does. Empty in a year without a sheet.
   */
  extra: RevenueProject[]
  extraTotal: number
}

export type YearRevenue = {
  year: number
  months: MonthRevenue[]
  yearTotal: number
  /**
   * Projects without a planned start and without a sheet line. They belong
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
   * True when the month figures are the lines of the imported planning
   * sheet — the office's own record of the year, line by line and month by
   * month. A line tied to a project links to it; a line without one is just
   * the sheet's line. Projects the sheet does not know are listed as `extra`.
   */
  sheetLed: boolean
  /**
   * True when the year is the sheet alone: no line tied to a project, no
   * project besides — the years the company ran before BauCrew existed.
   */
  fromSheet: boolean
}

/**
 * The "Monatsplanumsatz" of a year. Where the planning sheet has been
 * imported for the year, the sheet is the record: every line of it stands in
 * its month with its amount, tied to its project where a person tied it.
 * That is what the office reads as the year's turnover, and what the months
 * must add up to. A project the sheet does not know is listed beside the
 * month, uncounted, so it is seen and can be put into the sheet or tied to
 * a line.
 *
 * A year without a sheet is built from projects: each is filed under the
 * month of its planned start, own-crew work and SUB (subcontractor) work
 * apart. A project without a planned start is not guessed into a month —
 * the day it was typed in says nothing about when the work happens — but
 * listed as "undated".
 */
export async function getYearRevenue(year: number): Promise<YearRevenue> {
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year + 1, 0, 1))

  // The sheet's lines for the year, each with the project it is tied to.
  const lines = await db.planEntry.findMany({
    where: { year, month: { not: null } },
    orderBy: [{ month: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      month: true,
      name: true,
      amount: true,
      isSub: true,
      project: {
        select: {
          id: true,
          number: true,
          name: true,
          status: true,
          // The dates that say whether the project is old data.
          plannedStart: true,
          plannedEnd: true,
          actualStart: true,
          actualEnd: true,
          sourceCreatedAt: true,
          customer: { select: { id: true, name: true } },
        },
      },
    },
  })

  const projects = await db.project.findMany({
    where: {
      status: { not: 'CANCELLED' },
      OR: [
        { plannedStart: { gte: start, lt: end } },
        { plannedStart: null, createdAt: { gte: start, lt: end } },
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
      actualStart: true,
      actualEnd: true,
      sourceCreatedAt: true,
      createdAt: true,
      customer: { select: { id: true, name: true } },
      addOns: { select: { amount: true } },
      // The years of the sheet lines tied to the project.
      planEntries: { select: { year: true } },
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
    extra: [],
    extraTotal: 0,
  }))
  const undated: RevenueProject[] = []
  // Old data: work finished before the day the office named in Settings. It
  // is nobody's job to date it any more, so it is set aside from the undated
  // list — and counted, so the card can say how much was set aside.
  const cutoff = await getHistoryCutoff()
  let undatedHistorical = 0
  const sheetLed = lines.length > 0

  for (const line of lines) {
    const bucket = months[line.month! - 1]
    const entry: RevenueProject = line.project
      ? {
          key: line.id,
          id: line.project.id,
          number: line.project.number,
          name: line.name,
          customer: line.project.customer.name,
          customerId: line.project.customer.id,
          price: Number(line.amount),
          status: line.project.status,
          ...(isHistorical(line.project, cutoff) ? { settled: true } : {}),
        }
      : {
          key: line.id,
          id: line.id,
          number: '',
          name: line.name,
          customer: '',
          price: Number(line.amount),
          fromSheet: true,
        }
    if (line.isSub) {
      bucket.sub.push(entry)
      bucket.subTotal += entry.price ?? 0
    } else {
      bucket.own.push(entry)
      bucket.ownTotal += entry.price ?? 0
    }
    bucket.total = bucket.ownTotal + bucket.subTotal
  }

  for (const p of projects) {
    // In a sheet-led year a project with a line in this year is counted
    // where its lines are. One whose lines lie in another year, or that has
    // none, is listed beside the month it starts in, so it is not lost.
    if (sheetLed && p.planEntries.some((l) => l.year === year)) continue
    const entry: RevenueProject = {
      key: p.id,
      id: p.id,
      number: p.number,
      name: p.name,
      customer: p.customer.name,
      customerId: p.customer.id,
      price: orderValue(p.price, p.addOns),
      status: p.status,
      ...(isHistorical(p, cutoff) ? { settled: true } : {}),
    }
    if (!p.plannedStart) {
      if (isHistorical(p, cutoff)) undatedHistorical++
      else undated.push(entry)
      continue
    }
    const bucket = months[p.plannedStart.getUTCMonth()]
    if (sheetLed) {
      bucket.extra.push(entry)
      bucket.extraTotal += entry.price ?? 0
      continue
    }
    if (p.isSub) {
      bucket.sub.push(entry)
      bucket.subTotal += entry.price ?? 0
    } else {
      bucket.own.push(entry)
      bucket.ownTotal += entry.price ?? 0
    }
    bucket.total = bucket.ownTotal + bucket.subTotal
  }

  const nothingButSheet =
    sheetLed &&
    lines.every((l) => !l.project) &&
    months.every((m) => m.extra.length === 0) &&
    undated.length === 0 &&
    // The cutoff must not turn a live year into a "sheet only" one.
    undatedHistorical === 0

  return {
    year,
    months,
    yearTotal: months.reduce((sum, m) => sum + m.total, 0),
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

export type UsageRow = { id: string; name: string; days: number }

/** UTC [start, end) for a whole year or for a month range (0-11, inclusive) inside it. */
export function periodRange(year: number, range?: MonthRange | null): { start: Date; end: Date } {
  if (!range) return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) }
  return { start: new Date(Date.UTC(year, range.from, 1)), end: new Date(Date.UTC(year, range.to + 1, 1)) }
}

/** Scheduled days per employee and per vehicle within a year (or one month of it). */
export async function getYearUsage(
  year: number,
  range?: MonthRange | null
): Promise<{
  employees: UsageRow[]
  vehicles: UsageRow[]
}> {
  const { start, end } = periodRange(year, range)

  const entries = await db.scheduleEntry.findMany({
    where: { date: { gte: start, lt: end }, cancelledAt: null },
    select: {
      vehicles: { select: { vehicle: { select: { id: true, name: true } } } },
      employees: {
        select: { employee: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  })

  const employees = new Map<string, UsageRow>()
  const vehicles = new Map<string, UsageRow>()
  for (const entry of entries) {
    for (const ee of entry.employees) {
      const name = `${ee.employee.firstName} ${ee.employee.lastName}`.trim()
      const row = employees.get(ee.employee.id) ?? { id: ee.employee.id, name, days: 0 }
      row.days += 1
      employees.set(ee.employee.id, row)
    }
    for (const ev of entry.vehicles) {
      const row = vehicles.get(ev.vehicle.id) ?? {
        id: ev.vehicle.id,
        name: ev.vehicle.name,
        days: 0,
      }
      row.days += 1
      vehicles.set(ev.vehicle.id, row)
    }
  }

  const byDays = (a: UsageRow, b: UsageRow) => b.days - a.days || a.name.localeCompare(b.name)
  return {
    employees: [...employees.values()].sort(byDays),
    vehicles: [...vehicles.values()].sort(byDays),
  }
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
  }))
  return {
    offers,
    total: offers.reduce((sum, o) => sum + (o.price ?? 0), 0),
    staleCount: offers.filter((o) => o.ageDays >= STALE_OFFER_DAYS).length,
  }
}

// ── Heute: the company today, out of what is already entered ──

/** One job as the Heute tab reads it. */
export type TodayJob = {
  id: string
  number: string
  name: string
  customer: string
  status: string
  /** Price plus Nachträge; null when neither is entered. */
  amount: number | null
  plannedStart: Date | null
  plannedEnd: Date | null
  /** Finished before the history cutoff in Settings: the office's history, not today's work. */
  historical: boolean
  overdue: Overdue | null
  group: SiteGroup | null
  /** The next day the job is on the schedule, from today on. */
  nextVisit: Date | null
  /** Catalog items the site still needs and the warehouse has not given out. */
  missingItems: number
  checklistOpen: number
  checklistProblems: number
  /**
   * Planned or running work with no town typed in, so the weather warning
   * cannot look. An accepted offer gets its town when it is scheduled.
   */
  noCity: boolean
  /** Days since the job was entered (on the board it was imported from, if any) — how long an enquiry or offer has waited. */
  ageDays: number
}

/** A catalog item missing on ordered jobs, with the jobs it is missing on. */
export type MissingMaterial = { id: string; name: string; jobs: Array<{ id: string; number: string; name: string }> }

export type Today = {
  jobs: TodayJob[]
  material: MissingMaterial[]
  stockShort: StockShortage[]
  /** Who is on which site today. */
  schedule: {
    /** One row per site on today's schedule, the most people first — see `sitesToday`. */
    today: SiteCrew[]
    /** Different people on a site today, the ones away left out. */
    people: number
  }
}

/**
 * The Heute tab's data. One pass over every job answers most of it — the
 * stages, what is late, what is running, what starts soon, what material is
 * missing — by the rules in `src/lib/cockpit.ts`, where they are tested.
 */
export async function getToday(today: Date): Promise<Today> {
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const [projects, cutoff, entries, stockShort, awayToday] = await Promise.all([
    db.project.findMany({
      select: {
        id: true,
        number: true,
        name: true,
        status: true,
        price: true,
        city: true,
        plannedStart: true,
        plannedEnd: true,
        actualStart: true,
        actualEnd: true,
        sourceCreatedAt: true,
        createdAt: true,
        customer: { select: { name: true } },
        addOns: { select: { amount: true } },
        items: { where: { status: 'MISSING' }, select: { catalogItem: { select: { id: true, name: true } } } },
        checklists: { select: { items: { select: { ok: true, checkedAt: true } } } },
        scheduleEntries: {
          where: { date: { gte: day }, cancelledAt: null },
          select: { date: true },
          orderBy: { date: 'asc' },
          take: 1,
        },
      },
      orderBy: { number: 'desc' },
    }),
    getHistoryCutoff(),
    db.scheduleEntry.findMany({
      where: { date: day, cancelledAt: null },
      select: {
        projectId: true,
        startTime: true,
        project: { select: { number: true, name: true } },
        employees: { select: { employeeId: true, employee: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    }),
    getStockShortages(),
    db.absence.findMany({ where: { startDate: { lte: day }, endDate: { gte: day } }, select: { employeeId: true } }),
  ])

  const jobs: TodayJob[] = projects.map((p) => {
    const points = p.checklists.flatMap((c) => c.items)
    const dates = { status: p.status as string, plannedStart: p.plannedStart, plannedEnd: p.plannedEnd }
    return {
      id: p.id,
      number: p.number,
      name: p.name,
      customer: p.customer.name,
      status: p.status,
      amount: orderValue(p.price, p.addOns),
      plannedStart: p.plannedStart,
      plannedEnd: p.plannedEnd,
      historical: isHistorical(p, cutoff),
      overdue: overdueOf(dates, day),
      group: siteGroupOf(dates, day),
      nextVisit: p.scheduleEntries[0]?.date ?? null,
      missingItems: p.items.length,
      checklistOpen: points.filter((i) => i.checkedAt === null).length,
      checklistProblems: points.filter((i) => i.ok === false).length,
      noCity: (p.status === 'PLANNED' || p.status === 'IN_PROGRESS') && !p.city?.trim(),
      // An imported card keeps the day it was made on the board, not the day of the import.
      ageDays: Math.max(0, Math.floor((day.getTime() - (p.sourceCreatedAt ?? p.createdAt).getTime()) / 86_400_000)),
    }
  })

  // Missing material only matters where the work is still ahead.
  const material = new Map<string, MissingMaterial>()
  for (const p of projects) {
    if (p.status !== 'APPROVED' && p.status !== 'PLANNED' && p.status !== 'IN_PROGRESS') continue
    for (const item of p.items) {
      const row = material.get(item.catalogItem.id) ?? { id: item.catalogItem.id, name: item.catalogItem.name, jobs: [] }
      row.jobs.push({ id: p.id, number: p.number, name: p.name })
      material.set(item.catalogItem.id, row)
    }
  }

  const crew = sitesToday(entries, new Set(awayToday.map((a) => a.employeeId)))

  return {
    jobs,
    material: [...material.values()].sort((a, b) => a.name.localeCompare(b.name)),
    stockShort,
    schedule: { today: crew.sites, people: crew.people },
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
  const [projects, loose, sheetYears, cutoff] = await Promise.all([
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
    // A year the sheet covers month by month.
    db.planEntry.groupBy({ by: ['year'], where: { month: { not: null } } }),
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
      isSub: p.isSub,
      historical: isHistorical(p, cutoff),
      lines: p.planEntries.map((l) => ({ year: l.year, amount: Number(l.amount), isSub: l.isSub })),
    })),
    loose.map((l) => ({ id: l.id, year: l.year, month: l.month, name: l.name, amount: Number(l.amount) })),
    {
      sheetYears: sheetYears.map((g) => g.year),
      currentYear: today.getUTCFullYear(),
      runningMonth: today.getUTCMonth(),
    },
  )
}

// ── Auslastung: how booked the crew and the vehicles are ─────────

export type NamedUsage = UsageLoad & { name: string }

/**
 * The Auslastung tab's data: the crew's planned share month by month, and each
 * person and vehicle over the chosen period. The rules are `crewLoadByMonth`
 * and `crewUsage` in `src/lib/order-situation.ts`.
 */
export async function getCrewUsage(
  year: number,
  range: MonthRange | null
): Promise<{ covered: number[]; months: CrewMonth[]; people: NamedUsage[]; vehicles: NamedUsage[] }> {
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
    db.vehicle.findMany({ select: { id: true, name: true } }),
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
    vehicleBookings.map((b) => ({ vehicleId: b.vehicleId, date: b.scheduleEntry.date }))
  )
  const personName = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]))
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]))
  const byName = (a: NamedUsage, b: NamedUsage) => (b.pct ?? -1) - (a.pct ?? -1) || a.name.localeCompare(b.name)
  return {
    covered: usage.covered,
    months: crewLoadByMonth(year, people, absences),
    people: usage.people.map((u) => ({ ...u, name: personName.get(u.id) ?? '' })).sort(byName),
    vehicles: usage.vehicles.map((u) => ({ ...u, name: vehicleName.get(u.id) ?? '' })).sort(byName),
  }
}
