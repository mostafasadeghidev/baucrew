import 'server-only'
import { db } from './db'
import { computeEfficiency, type EfficiencyResult, type MonthRange } from './reports-calc'
import { geocodeCity } from './geocode'
import { stockShortage } from './stock'

export type RevenueProject = {
  id: string
  number: string
  name: string
  customer: string
  price: number | null
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
}

/**
 * Rebuilds the "Monatsplanumsatz" sheet from live data: every non-cancelled
 * project is assigned to the month of its planned start (falling back to its
 * creation date), split into own-crew work and SUB (subcontractor) work.
 */
export async function getYearRevenue(year: number): Promise<YearRevenue> {
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year + 1, 0, 1))

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
      plannedStart: true,
      createdAt: true,
      customer: { select: { name: true } },
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

  for (const p of projects) {
    const anchor = p.plannedStart ?? p.createdAt
    const bucket = months[anchor.getUTCMonth()]
    const entry: RevenueProject = {
      id: p.id,
      number: p.number,
      name: p.name,
      customer: p.customer.name,
      price: orderValue(p.price, p.addOns),
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

  return {
    year,
    months,
    yearTotal: months.reduce((sum, m) => sum + m.total, 0),
  }
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

// ── Pipeline (open order book by status) ─────────────────────

export type PipelineBucket = {
  key: 'offers' | 'ordered' | 'inProgress' | 'planned'
  total: number
  count: number
}

/**
 * Open order book (net values), split so the office sees what is still just an
 * offer: "offers" (QUOTED — sent, waiting for confirmation), "ordered"
 * (APPROVED — signed, not started), "in progress" and "planned" (the rest).
 */
export async function getPipeline(): Promise<PipelineBucket[]> {
  const projects = await db.project.findMany({
    where: { status: { in: ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS'] } },
    select: { status: true, price: true, addOns: { select: { amount: true } } },
  })
  const rows = projects.map((p) => ({
    status: p.status,
    total: orderValue(p.price, p.addOns) ?? 0,
  }))
  const buckets: Record<PipelineBucket['key'], PipelineBucket> = {
    offers: { key: 'offers', total: 0, count: 0 },
    ordered: { key: 'ordered', total: 0, count: 0 },
    inProgress: { key: 'inProgress', total: 0, count: 0 },
    planned: { key: 'planned', total: 0, count: 0 },
  }
  for (const r of rows) {
    const key: PipelineBucket['key'] =
      r.status === 'QUOTED'
        ? 'offers'
        : r.status === 'APPROVED'
          ? 'ordered'
          : r.status === 'IN_PROGRESS'
            ? 'inProgress'
            : 'planned'
    buckets[key].total += r.total
    buckets[key].count += 1
  }
  return [buckets.offers, buckets.ordered, buckets.inProgress, buckets.planned]
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

/** An offer older than this without an answer is worth chasing. */
export const STALE_OFFER_DAYS = 21

// ── Project efficiency: plan vs. actual for finished projects ─

export type EfficiencyRow = EfficiencyResult & {
  id: string
  number: string
  name: string
  customer: string
  price: number | null
}

/**
 * Finished projects (COMPLETED / INVOICED / PAID) whose planned start (or, if
 * missing, creation) falls into the year, with planned vs. actual days from
 * the schedule and revenue per person-day.
 */
export async function getProjectEfficiency(
  year: number,
  range?: MonthRange | null
): Promise<{
  rows: EfficiencyRow[]
  avg: { plannedDays: number | null; actualDays: number | null; revenuePerPersonDay: number | null; delayDays: number | null }
}> {
  const { start, end } = periodRange(year, range)
  const projects = await db.project.findMany({
    where: {
      status: { in: ['COMPLETED', 'INVOICED', 'PAID'] },
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
      plannedStart: true,
      plannedEnd: true,
      actualStart: true,
      actualEnd: true,
      customer: { select: { name: true } },
      addOns: { select: { amount: true } },
      scheduleEntries: { select: { date: true, _count: { select: { employees: true } } } },
    },
    orderBy: { number: 'desc' },
  })

  const rows: EfficiencyRow[] = projects.map((p) => ({
    id: p.id,
    number: p.number,
    name: p.name,
    customer: p.customer.name,
    price: orderValue(p.price, p.addOns),
    ...computeEfficiency({
      price: orderValue(p.price, p.addOns),
      plannedStart: p.plannedStart,
      plannedEnd: p.plannedEnd,
      actualStart: p.actualStart,
      actualEnd: p.actualEnd,
      entries: p.scheduleEntries.map((e) => ({ date: e.date, employeeCount: e._count.employees })),
    }),
  }))

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

// ── Data quality: things that make the numbers wrong ─────────────

export type QualityIssue = {
  key:
    | 'inProgressNoSchedule'
    | 'finishedNoPrice'
    | 'noCity'
    | 'cityNotFound'
    | 'missingItems'
    | 'stockShort'
    | 'staleOffers'
  count: number
  items: Array<{ id: string; label: string }>
}

export async function getDataQuality(): Promise<QualityIssue[]> {
  const today = new Date()
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const in14 = new Date(todayUtc.getTime() + 14 * 86_400_000)
  const [inProgressNoSchedule, finishedNoPrice, noCity, missing, cityCandidates, stockShort] = await Promise.all([
    db.project.findMany({
      where: { status: 'IN_PROGRESS', scheduleEntries: { none: { date: { gte: todayUtc, lte: in14 }, cancelledAt: null } } },
      select: { id: true, number: true, name: true },
      orderBy: { number: 'asc' },
    }),
    db.project.findMany({
      where: { status: { in: ['COMPLETED', 'INVOICED', 'PAID'] }, price: null, addOns: { none: {} } },
      select: { id: true, number: true, name: true },
      orderBy: { number: 'asc' },
    }),
    db.project.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'] },
        OR: [{ city: null }, { city: '' }],
      },
      select: { id: true, number: true, name: true },
      orderBy: { number: 'asc' },
    }),
    db.projectItem.groupBy({
      by: ['catalogItemId'],
      where: { status: 'MISSING', project: { status: { in: ['PLANNED', 'IN_PROGRESS', 'APPROVED'] } } },
      _count: { _all: true },
    }),
    // Active projects with a typed city but no stored coordinates: try to geocode
    // (cached 24 h); those that fail cannot get weather warnings.
    db.project.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'] },
        city: { not: null },
        latitude: null,
      },
      select: { id: true, number: true, name: true, city: true },
      orderBy: { number: 'asc' },
      take: 40,
    }),
    getStockShortages(),
  ])
  // Offers that have been waiting too long for an answer.
  const staleOffers = (await getOpenOffers()).offers.filter((o) => o.ageDays >= STALE_OFFER_DAYS)
  const cityCache = new Map<string, boolean>()
  const cityNotFound: Array<{ id: string; number: string; name: string; city: string | null }> = []
  for (const p of cityCandidates) {
    const city = (p.city ?? '').trim()
    if (!city) continue
    let ok = cityCache.get(city)
    if (ok == null) {
      ok = (await geocodeCity(city)) != null
      cityCache.set(city, ok)
    }
    if (!ok) cityNotFound.push(p)
  }
  const missingIds = missing.filter((m) => m._count._all >= 2).map((m) => m.catalogItemId)
  const missingItems = missingIds.length
    ? await db.catalogItem.findMany({ where: { id: { in: missingIds } }, select: { id: true, name: true } })
    : []
  const countFor = new Map(missing.map((m) => [m.catalogItemId, m._count._all]))
  const proj = (rows: Array<{ id: string; number: string; name: string }>) =>
    rows.map((r) => ({ id: r.id, label: `${r.number} — ${r.name}` }))
  return [
    { key: 'inProgressNoSchedule', count: inProgressNoSchedule.length, items: proj(inProgressNoSchedule) },
    { key: 'finishedNoPrice', count: finishedNoPrice.length, items: proj(finishedNoPrice) },
    { key: 'noCity', count: noCity.length, items: proj(noCity) },
    {
      key: 'cityNotFound',
      count: cityNotFound.length,
      items: cityNotFound.map((r) => ({ id: r.id, label: `${r.number} — ${r.name} (${r.city})` })),
    },
    {
      key: 'missingItems',
      count: missingItems.length,
      items: missingItems.map((i) => ({ id: i.id, label: `${i.name} (${countFor.get(i.id) ?? 0}×)` })),
    },
    {
      key: 'staleOffers',
      count: staleOffers.length,
      items: staleOffers.map((o) => ({ id: o.id, label: `${o.number} — ${o.name} (${o.ageDays} T.)` })),
    },
    {
      key: 'stockShort',
      count: stockShort.length,
      items: stockShort.map((i) => ({
        id: i.id,
        label: `${i.name} — ${i.stock}${i.unit ? ' ' + i.unit : ''} / ${i.need}${i.unit ? ' ' + i.unit : ''}`,
      })),
    },
  ]
}
