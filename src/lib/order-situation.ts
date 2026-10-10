/**
 * How sure each month's money is — the order situation the revenue tab opens
 * with.
 *
 * The month cards say what a month is worth. The owner's questions are other
 * ones: how much of that is certain, how much is done and still waiting to be
 * billed or paid, and whether the crew has work in the months ahead. Every
 * line of a month stands on a project, and the project's status says how far
 * along its money is; a sheet line with no project is only a plan.
 *
 * Pure, so the rules are tested without a database.
 */

import { isHistorical, projectHistoryDate, type HistoryProject } from './history'
import { firstMonth } from './plan-month'
import { businessDaysBetween } from './reports-calc'

/** Surest first. */
export const CERTAINTIES = ['paid', 'invoiced', 'done', 'ordered', 'offered', 'sheet'] as const
export type Certainty = (typeof CERTAINTIES)[number]

/** The money that no longer waits for anybody to say yes. */
export const SECURED: readonly Certainty[] = ['paid', 'invoiced', 'done', 'ordered']

/**
 * Where a line's money stands, by the status of its project. An enquiry and an
 * offer are both still waiting for a yes. Finished work from before the
 * history cutoff in Settings is settled — the office named that day so nobody
 * is asked about such work again — and counts with what is paid. A sheet line
 * with no project, or one whose project has been cancelled since, stands only
 * in the sheet.
 */
export function certaintyOf(status: string | undefined, settled = false): Certainty {
  switch (status) {
    case 'PAID':
      return 'paid'
    case 'INVOICED':
      return settled ? 'paid' : 'invoiced'
    case 'COMPLETED':
      return settled ? 'paid' : 'done'
    case 'APPROVED':
    case 'PLANNED':
    case 'IN_PROGRESS':
      return 'ordered'
    case 'LEAD':
    case 'QUOTED':
      return 'offered'
    default:
      return 'sheet'
  }
}

/** One line of a month, as the revenue loader builds it. */
export type SituationLine = {
  key: string
  id: string
  name: string
  customer: string
  price: number | null
  status?: string
  settled?: boolean
  fromSheet?: boolean
}

const lineCertainty = (line: SituationLine) =>
  certaintyOf(line.fromSheet ? undefined : line.status, line.settled)

export const emptyTotals = (): Record<Certainty, number> => ({
  paid: 0,
  invoiced: 0,
  done: 0,
  ordered: 0,
  offered: 0,
  sheet: 0,
})

export function certaintyTotals(lines: SituationLine[]): Record<Certainty, number> {
  const totals = emptyTotals()
  for (const line of lines) totals[lineCertainty(line)] += line.price ?? 0
  return totals
}

/** A month's lines that are ordered work, the biggest first: what `certaintyTotals(…).ordered` adds up. */
export function orderedLines<T extends SituationLine>(lines: T[]): T[] {
  return lines.filter((line) => lineCertainty(line) === 'ordered').sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
}

export const securedOf = (totals: Record<Certainty, number>): number =>
  SECURED.reduce((sum, certainty) => sum + totals[certainty], 0)

/**
 * The four states the Planumsatz is told in, surest first. Whether finished
 * work is billed or paid is money by job, told under "Geld ausstehend" in the
 * job's own value — in the month's sheet amounts it would be a second figure
 * for the same thing, so the three finished states are one here.
 */
export const CLASSES = ['finished', 'ordered', 'offered', 'sheet'] as const
export type PlanClass = (typeof CLASSES)[number]

export const CLASS_OF: Record<Certainty, PlanClass> = {
  paid: 'finished',
  invoiced: 'finished',
  done: 'finished',
  ordered: 'ordered',
  offered: 'offered',
  sheet: 'sheet',
}

/** Certainty totals folded into the four classes; they add up to the same sum. */
export function classTotals(totals: Record<Certainty, number>): Record<PlanClass, number> {
  const out: Record<PlanClass, number> = { finished: 0, ordered: 0, offered: 0, sheet: 0 }
  for (const certainty of CERTAINTIES) out[CLASS_OF[certainty]] += totals[certainty]
  return out
}

/**
 * The twelve months before the running one — this year's so far and the rest
 * of last year's. Months before the first one with any turnover are left out:
 * a company that began keeping its figures here in March did not have a
 * January of nothing. Empty when there is nothing to go on.
 */
export function trailingMonths(thisYear: number[], lastYear: number[] | null, runningMonth: number): number[] {
  const months = [...(lastYear ? lastYear.slice(runningMonth) : []), ...thisYear.slice(0, runningMonth)]
  const start = months.findIndex((v) => v > 0)
  return start < 0 ? [] : months.slice(start)
}

/** What the company turns over in an ordinary week, over those months. Null without them. */
export function weeklyTurnover(thisYear: number[], lastYear: number[] | null, runningMonth: number): number | null {
  const months = trailingMonths(thisYear, lastYear, runningMonth)
  const total = months.reduce((a, b) => a + b, 0)
  if (months.length === 0 || total <= 0) return null
  return total / ((months.length * 52) / 12)
}

/**
 * What an ordinary month brings, over the same months. It is the line the
 * month bars are read against: the office wanted "does this month cover the
 * costs", and the cost figure is nobody's to guess — what the company usually
 * turns over is, and it answers the same question well enough to act on.
 */
export function monthlyAverage(thisYear: number[], lastYear: number[] | null, runningMonth: number): number | null {
  const months = trailingMonths(thisYear, lastYear, runningMonth)
  const total = months.reduce((a, b) => a + b, 0)
  if (months.length === 0 || total <= 0) return null
  return total / months.length
}

export type SituationOffer = { id: string; name: string; customer: string; amount: number | null; ageDays: number }

export type MonthSituation = {
  month: number
  total: number
  totals: Record<Certainty, number>
  /** The same month a year earlier, or null when that year is unknown. */
  lastYear: number | null
  crew: CrewMonth | null
  /** The month's lines, each with where its money stands. */
  lines: Array<{
    key: string
    /** The project to open, or null for a sheet line with none. */
    id: string | null
    name: string
    customer: string
    amount: number | null
    certainty: Certainty
  }>
  /** Offers planned to start this month that are not a line of the year yet. */
  offers: SituationOffer[]
}

export function monthSituations(input: {
  year: number
  months: Array<{ month: number; own: SituationLine[]; sub: SituationLine[] }>
  lastYear: number[] | null
  crew: CrewMonth[] | null
  offers: Array<{
    id: string
    name: string
    customer: string
    price: number | null
    ageDays: number
    plannedStart: Date | null
    /** The month the office placed it in, when no start is fixed. */
    planMonth?: Date | null
  }>
}): MonthSituation[] {
  // An offer that already stands as a line in any month of the year is placed;
  // it is not one more offer for the month it was meant to start in.
  const tied = new Set(
    input.months
      .flatMap((m) => [...m.own, ...m.sub])
      .filter((l) => !l.fromSheet)
      .map((l) => l.id)
  )
  return input.months.map((m) => {
    const lines = [...m.own, ...m.sub]
    const totals = certaintyTotals(lines)
    return {
      month: m.month,
      total: CERTAINTIES.reduce((sum, certainty) => sum + totals[certainty], 0),
      totals,
      lastYear: input.lastYear?.[m.month] ?? null,
      crew: input.crew?.[m.month] ?? null,
      lines: lines.map((l) => ({
        key: l.key,
        id: l.fromSheet ? null : l.id,
        name: l.name,
        customer: l.customer,
        amount: l.price,
        certainty: lineCertainty(l),
      })),
      offers: input.offers
        .filter((o) => {
          const first = firstMonth({ plannedStart: o.plannedStart, plannedEnd: null, planMonth: o.planMonth ?? null, planMonths: 1 })
          return first !== null && first.year === input.year && first.month === m.month && !tied.has(o.id)
        })
        .map((o) => ({ id: o.id, name: o.name, customer: o.customer, amount: o.price, ageDays: o.ageDays })),
    }
  })
}

export type SituationSummary = {
  total: number
  secured: number
  /** Enquiries, offers and sheet lines: in the total, and not certain. */
  unsure: number
  /** Ordered work for the twelve months from the running one; null in any other year. */
  backlog: number | null
  /** The backlog in ordinary weeks of turnover; null without either. */
  weeks: number | null
}

/**
 * The year's figures above the bars. The backlog runs twelve months from the
 * running one: late in the year most of it stands in the next, so the next
 * year's ordered work up to the running month counts too, when it is given.
 */
export function situationSummary(
  months: MonthSituation[],
  runningMonth: number,
  weekly: number | null,
  nextYearOrdered: number[] | null = null
): SituationSummary {
  const sum = (pick: (m: MonthSituation) => number) => months.reduce((a, m) => a + pick(m), 0)
  const backlog =
    runningMonth >= 0
      ? sum((m) => (m.month >= runningMonth ? m.totals.ordered : 0)) +
        (nextYearOrdered ?? []).slice(0, runningMonth).reduce((a, b) => a + b, 0)
      : null
  return {
    total: sum((m) => m.total),
    secured: sum((m) => securedOf(m.totals)),
    unsure: sum((m) => m.totals.offered + m.totals.sheet),
    backlog,
    weeks: backlog !== null && weekly ? Math.round(backlog / weekly) : null,
  }
}

/** A finished project as the list of money still to come in reads it. */
export type OpenMoneyProject = HistoryProject & {
  id: string
  number: string
  name: string
  customer: string
  amount: number | null
}

export type OpenMoneyRow = {
  id: string
  number: string
  name: string
  customer: string
  amount: number | null
  /** The day the work is filed under — when it ended, or was meant to. */
  since: Date | null
}

export type OpenMoney = {
  done: { total: number; rows: OpenMoneyRow[] }
  invoiced: { total: number; rows: OpenMoneyRow[] }
}

/**
 * Money earned and not yet in: finished work nobody has billed, and bills
 * nobody has paid — oldest first. Old data, work finished before the history
 * cutoff in Settings, is left out: a card imported as finished years ago is not
 * an unpaid bill. Any other status is none of this list's business.
 */
export function openMoneyOf(projects: OpenMoneyProject[], cutoff: Date | null): OpenMoney {
  const open: OpenMoney = { done: { total: 0, rows: [] }, invoiced: { total: 0, rows: [] } }
  for (const p of projects) {
    if (p.status !== 'COMPLETED' && p.status !== 'INVOICED') continue
    if (isHistorical(p, cutoff)) continue
    const bucket = p.status === 'COMPLETED' ? open.done : open.invoiced
    bucket.total += p.amount ?? 0
    bucket.rows.push({
      id: p.id,
      number: p.number,
      name: p.name,
      customer: p.customer,
      amount: p.amount,
      since: projectHistoryDate(p),
    })
  }
  const time = (row: OpenMoneyRow) => row.since?.getTime() ?? Number.POSITIVE_INFINITY
  for (const bucket of [open.done, open.invoiced]) bucket.rows.sort((a, b) => time(a) - time(b) || 0)
  return open
}

export type UsageLoad = {
  id: string
  /** Distinct weekdays on the schedule, outside the days away. */
  booked: number
  /** Weekdays of the window, less the days away. */
  available: number
  pct: number | null
}

export type CrewMonth = {
  /** Person-days on the schedule: one person on one working day, however many sites. */
  booked: number
  /** The window's weekdays in the month for everybody booked in it, less the days they are away. */
  available: number
  /** Null for a month the schedule is not written for — before its first day or after its last. */
  pct: number | null
}

/** The first and the last day counted, both inclusive, as UTC midnights. */
export type UsageWindow = { start: Date; end: Date }

const DAY_MS = 86_400_000
const isWeekday = (date: Date) => date.getUTCDay() !== 0 && date.getUTCDay() !== 6
const isoDay = (date: Date) => date.toISOString().slice(0, 10)
const weekdaysIn = (w: UsageWindow | null) => (w ? (businessDaysBetween(w.start, w.end) ?? 0) : 0)

/** Two stretches of days laid over each other; null when they do not meet. */
function overlap(a: UsageWindow | null, b: UsageWindow): UsageWindow | null {
  if (!a) return null
  const start = Math.max(a.start.getTime(), b.start.getTime())
  const end = Math.min(a.end.getTime(), b.end.getTime())
  return start > end ? null : { start: new Date(start), end: new Date(end) }
}

/** From the first to the last of the dates; null without any. */
function spanOf(dates: Date[]): UsageWindow | null {
  if (dates.length === 0) return null
  const times = dates.map((d) => d.getTime())
  return { start: new Date(Math.min(...times)), end: new Date(Math.max(...times)) }
}

/**
 * How booked the crew, each person and each vehicle is over a period — one
 * rule for the ring, the month bars and the rows, so the three always add up.
 *
 * One booking a weekday at most, however many sites that day, never on a day
 * away, against the weekdays there were. Public holidays are not taken off.
 *
 * Only the stretch the schedule is written for counts: from the first to the
 * last day anybody is booked in the year. The schedule is filled a few weeks
 * ahead and may have been started mid-year; a day before it began or after
 * the last entry says nothing about the crew, and counted it would pull every
 * share down to a figure that measures missing entries, not idle people. Inside
 * that stretch an empty weekday counts — that is a day nobody was planned.
 * People and vehicles each have their own stretch: a van booked into October
 * says nothing about whether the crew is.
 *
 * The crew is everybody booked in the period — office staff who never are
 * would otherwise count as a crew with nothing to do. The months of the period
 * are held against that same crew, so their bars add up to the ring and the
 * rows exactly, and a month in which nobody was booked reads 0 %, not "not
 * planned". A month outside the period, drawn only for the context, is held
 * against the year's crew. Every vehicle in `fleet` gets a row, also one that
 * stood the whole period: an idle van is what the list is for.
 */
export function crewUsage(
  year: number,
  months: number[],
  bookings: Array<{ employeeId: string; date: Date }>,
  absences: Array<{ employeeId: string; startDate: Date; endDate: Date }>,
  vehicleBookings: Array<{ vehicleId: string; date: Date }>,
  fleet: string[] = []
): { window: UsageWindow | null; months: CrewMonth[]; people: UsageLoad[]; vehicles: UsageLoad[] } {
  const first = Math.min(...months)
  const last = Math.max(...months)
  const period: UsageWindow = { start: new Date(Date.UTC(year, first, 1)), end: new Date(Date.UTC(year, last + 1, 0)) }
  const monthOf = (month: number): UsageWindow => ({
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 0)),
  })
  const inYear = <T extends { date: Date }>(rows: T[]) => rows.filter((b) => b.date.getUTCFullYear() === year)
  const within = (date: Date, w: UsageWindow | null) =>
    w !== null && date.getTime() >= w.start.getTime() && date.getTime() <= w.end.getTime()

  const people = inYear(bookings)
  const crewSpan = spanOf(people.map((b) => b.date))
  const window = overlap(crewSpan, period)
  const fleetSpan = spanOf(inYear(vehicleBookings).map((b) => b.date))
  const vehicleWindow = overlap(fleetSpan, period)

  // The weekdays each person is away inside the year's stretch, each day once.
  const away = new Map<string, Set<string>>()
  for (const a of absences) {
    if (!crewSpan) break
    const from = Math.max(a.startDate.getTime(), crewSpan.start.getTime())
    const to = Math.min(a.endDate.getTime(), crewSpan.end.getTime())
    for (let t = from; t <= to; t += DAY_MS) {
      const day = new Date(t)
      if (!isWeekday(day)) continue
      const days = away.get(a.employeeId) ?? new Set<string>()
      days.add(isoDay(day))
      away.set(a.employeeId, days)
    }
  }
  const awayIn = (employeeId: string, w: UsageWindow | null) =>
    w ? [...(away.get(employeeId) ?? [])].filter((day) => within(new Date(`${day}T00:00:00Z`), w)).length : 0
  const counts = (employeeId: string, date: Date) => isWeekday(date) && !away.get(employeeId)?.has(isoDay(date))

  const load = (id: string, booked: number, available: number): UsageLoad => ({
    id,
    booked,
    available,
    pct: available > 0 ? Math.round((booked / available) * 100) : null,
  })
  const byPct = (a: UsageLoad, b: UsageLoad) => (b.pct ?? -1) - (a.pct ?? -1) || b.booked - a.booked

  // Everybody on the schedule in the period gets a row — also somebody whose
  // only bookings fell on a weekend or on their days away, who then reads 0 %.
  const personDays = new Map<string, Set<string>>()
  for (const b of people) {
    if (!within(b.date, window)) continue
    const days = personDays.get(b.employeeId) ?? new Set<string>()
    personDays.set(b.employeeId, days)
    if (counts(b.employeeId, b.date)) days.add(isoDay(b.date))
  }
  const windowDays = weekdaysIn(window)
  const personRows = [...personDays].map(([id, days]) =>
    load(id, days.size, Math.max(0, windowDays - awayIn(id, window)))
  )

  const vehicleDays = new Map<string, Set<string>>(vehicleWindow ? fleet.map((id) => [id, new Set<string>()]) : [])
  for (const b of inYear(vehicleBookings)) {
    if (!within(b.date, vehicleWindow)) continue
    const days = vehicleDays.get(b.vehicleId) ?? new Set<string>()
    vehicleDays.set(b.vehicleId, days)
    if (isWeekday(b.date)) days.add(isoDay(b.date))
  }
  const vehicleWeekdays = weekdaysIn(vehicleWindow)
  const vehicleRows = [...vehicleDays].map(([id, days]) => load(id, days.size, vehicleWeekdays))

  // Each month of the year inside the year's stretch: the period's months on
  // the period's crew, the others on the year's.
  const periodCrew = [...personDays.keys()]
  const yearCrew = [...new Set(people.map((b) => b.employeeId))]
  const monthRows = Array.from({ length: 12 }, (_, month): CrewMonth => {
    const w = overlap(crewSpan, monthOf(month))
    if (!w) return { booked: 0, available: 0, pct: null }
    const crew = month >= first && month <= last ? periodCrew : yearCrew
    const weekdays = weekdaysIn(w)
    let available = 0
    let total = 0
    for (const id of crew) {
      available += Math.max(0, weekdays - awayIn(id, w))
      total += new Set(
        people
          .filter((b) => b.employeeId === id && b.date.getUTCMonth() === month && counts(id, b.date))
          .map((b) => isoDay(b.date))
      ).size
    }
    return { booked: total, available, pct: available > 0 ? Math.round((total / available) * 100) : null }
  })

  return {
    window,
    months: monthRows,
    people: personRows.sort(byPct),
    vehicles: vehicleRows.sort(byPct),
  }
}
