/**
 * The rules behind the CRM's Heute tab: the state of the company today, read
 * out of what is already entered.
 *
 * The office reads its company as a handful of parts, each one number with a
 * lamp, and it grades what is stuck higher than what is big. Nothing here is a
 * new field: every figure is a rule over projects, the planning sheet, the
 * schedule and the site material lists, so none of it can fall out of date the
 * way a status somebody has to set does.
 *
 * One rule per concept. Old data — work finished before the history cutoff in
 * Settings — never shows up in a lamp or a list; where it is left out, it is
 * counted in a footnote instead.
 *
 * Pure, so the rules are tested without a database.
 */

import { businessDaysBetween } from './reports-calc'

/** A lamp says whether to look. `none` means there is nothing to judge yet. */
export type Lamp = 'green' | 'yellow' | 'red' | 'none'

/** More is worse: none of it is green, some of it yellow, a lot of it red. */
export const lampAbove = (value: number, yellowFrom: number, redFrom: number): Lamp =>
  value >= redFrom ? 'red' : value >= yellowFrom ? 'yellow' : 'green'

/** Ordered and not yet finished. */
export const ORDERED = ['APPROVED', 'PLANNED', 'IN_PROGRESS'] as const

const isOrdered = (status: string) => (ORDERED as readonly string[]).includes(status)

const DAY = 86_400_000
const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

export type Overdue = {
  /** `end`: the planned end has passed. `start`: the planned start has passed and the work has not begun. */
  reason: 'end' | 'start'
  /** Working days since the day that passed — at least one. */
  workdaysLate: number
}

/**
 * Whether ordered work is past its date. Two ways to be late: the planned end
 * has passed while the job is still open, or the planned start has passed and
 * the job never began. An enquiry or an offer is never late — its date is a
 * wish, not a promise. Delays are counted in working days.
 */
export function overdueOf(
  p: { status: string; plannedStart: Date | null; plannedEnd: Date | null },
  today: Date
): Overdue | null {
  if (!isOrdered(p.status)) return null
  const now = utcDay(today)
  const late = (due: Date) =>
    Math.max(1, businessDaysBetween(new Date(utcDay(due) + DAY), new Date(now)) ?? 0)
  const end = p.plannedEnd ?? p.plannedStart
  if (end && utcDay(end) < now) return { reason: 'end', workdaysLate: late(end) }
  if (p.status !== 'IN_PROGRESS' && p.plannedStart && utcDay(p.plannedStart) < now) {
    return { reason: 'start', workdaysLate: late(p.plannedStart) }
  }
  return null
}

/** Sites that start within this many days count as starting soon. */
export const SOON_DAYS = 14

export type SiteGroup = 'overdue' | 'running' | 'starting'

/**
 * Where a job stands in the one Baustellen table, so that every job appears
 * there once: late first, then what is running within its dates, then what
 * starts in the next two weeks.
 */
export function siteGroupOf(
  p: { status: string; plannedStart: Date | null; plannedEnd: Date | null },
  today: Date
): SiteGroup | null {
  if (overdueOf(p, today)) return 'overdue'
  if (p.status === 'IN_PROGRESS') return 'running'
  if (!isOrdered(p.status) || !p.plannedStart) return null
  const start = utcDay(p.plannedStart)
  const now = utcDay(today)
  return start >= now && start <= now + SOON_DAYS * DAY ? 'starting' : null
}

export type SiteProgress = {
  /** Working days the site was planned to take. */
  plannedDays: number | null
  /** Working days of it that are behind us. */
  doneDays: number | null
  pct: number | null
}

/**
 * How much of a running site's planned time has passed, counted in working
 * days — not in ticked checklist boxes: a fully prepared site has been built
 * nothing. Days after the planned end do not push it past a hundred; they show
 * as a job that is late.
 */
export function siteProgress(plannedStart: Date | null, plannedEnd: Date | null, today: Date): SiteProgress {
  if (!plannedStart) return { plannedDays: null, doneDays: null, pct: null }
  const end = plannedEnd ?? plannedStart
  const plannedDays = businessDaysBetween(plannedStart, end)
  const now = utcDay(today)
  if (now < utcDay(plannedStart)) return { plannedDays, doneDays: 0, pct: plannedDays ? 0 : null }
  const until = now < utcDay(end) ? new Date(now) : end
  const doneDays = businessDaysBetween(plannedStart, until)
  const pct =
    plannedDays && plannedDays > 0 && doneDays !== null ? Math.min(100, Math.round((doneDays / plannedDays) * 100)) : null
  return { plannedDays, doneDays, pct }
}

// ── The crew, day by day ────────────────────────────────────

/** A day on the schedule and how many people stand on it. */
export type CrewDay = { date: Date; people: number }

/** Monday to Friday. Public holidays are not known to the app and count as working days. */
export const isWorkday = (day: CrewDay) => day.date.getUTCDay() !== 0 && day.date.getUTCDay() !== 6

/**
 * Every day from `start` to `end`, each with the people planned on it. A
 * person counts once a day however many sites they go to, and not on a day
 * they are away: they will not be on site.
 *
 * People are counted as they are planned, never as a crew size times days: a
 * helper on the schedule twice a year is not a person missing work every day.
 */
export function crewDays(
  bookings: Array<{ employeeId: string; date: Date }>,
  absences: Array<{ employeeId: string; startDate: Date; endDate: Date }>,
  start: Date,
  end: Date
): CrewDay[] {
  const first = utcDay(start)
  const last = utcDay(end)
  const away = new Map<string, Array<[number, number]>>()
  for (const a of absences) {
    away.set(a.employeeId, [...(away.get(a.employeeId) ?? []), [utcDay(a.startDate), utcDay(a.endDate)]])
  }
  const people = new Map<number, Set<string>>()
  for (const b of bookings) {
    const day = utcDay(b.date)
    if (day < first || day > last) continue
    if (away.get(b.employeeId)?.some(([from, to]) => from <= day && day <= to)) continue
    people.set(day, (people.get(day) ?? new Set<string>()).add(b.employeeId))
  }
  const days: CrewDay[] = []
  for (let day = first; day <= last; day += DAY) days.push({ date: new Date(day), people: people.get(day)?.size ?? 0 })
  return days
}

const toTenth = (value: number) => Math.round(value * 10) / 10

/** How far back the usual crew is read: thirteen weeks, about three months. */
export const USUAL_CREW_DAYS = 91

/**
 * How many people an ordinary working day has: the average of the working
 * days anybody was planned. A day with nobody on the schedule is a holiday, a
 * week the company was closed, or a time before the schedule was kept here;
 * none of them says how big the crew is, and neither does a weekend crew. Null
 * without such a day.
 */
export function usualCrew(days: CrewDay[]): number | null {
  const staffed = days.filter((day) => isWorkday(day) && day.people > 0)
  if (staffed.length === 0) return null
  return toTenth(staffed.reduce((sum, day) => sum + day.people, 0) / staffed.length)
}

/**
 * The team lamp, for today. Nothing to judge on a Saturday or a Sunday. On a
 * working day yellow with nobody on the schedule, or when a quarter of the
 * usual crew or more has no site today; green otherwise.
 */
export function todayCrewLamp(today: CrewDay, usual: number | null): Lamp {
  if (!isWorkday(today)) return 'none'
  if (today.people === 0) return 'yellow'
  if (usual !== null && today.people < usual * 0.75) return 'yellow'
  return 'green'
}

export type SitePerson = { id: string; name: string }

/** A site on today's schedule: who is on it, and who is booked on it but away today. */
export type SiteCrew = { projectId: string; number: string; name: string; people: SitePerson[]; away: SitePerson[] }

const byName = (a: SitePerson, b: SitePerson) => a.name.localeCompare(b.name, 'de')

/**
 * Today's schedule by site, the sites with the most people first and the
 * people on each in alphabetical order. Somebody booked on a site but away
 * today will not come: they are named apart and not counted. `people` counts
 * everybody on a site today once, however many sites they are booked on — the
 * same rule as `crewDays`.
 */
export function sitesToday(
  entries: Array<{
    projectId: string
    project: { number: string; name: string }
    employees: Array<{ employeeId: string; employee: { firstName: string; lastName: string } }>
  }>,
  awayIds: ReadonlySet<string>
): { sites: SiteCrew[]; people: number } {
  const sites = new Map<string, { site: SiteCrew; ids: Set<string> }>()
  const onSite = new Set<string>()
  for (const entry of entries) {
    const row = sites.get(entry.projectId) ?? {
      site: { projectId: entry.projectId, number: entry.project.number, name: entry.project.name, people: [], away: [] },
      ids: new Set<string>(),
    }
    for (const { employeeId, employee } of entry.employees) {
      if (row.ids.has(employeeId)) continue
      row.ids.add(employeeId)
      const person = { id: employeeId, name: `${employee.firstName} ${employee.lastName}`.trim() }
      if (awayIds.has(employeeId)) {
        row.site.away.push(person)
      } else {
        row.site.people.push(person)
        onSite.add(employeeId)
      }
    }
    sites.set(entry.projectId, row)
  }
  return {
    sites: [...sites.values()]
      .map(({ site }) => ({ ...site, people: site.people.sort(byName), away: site.away.sort(byName) }))
      .sort((a, b) => b.people.length - a.people.length),
    people: onSite.size,
  }
}
