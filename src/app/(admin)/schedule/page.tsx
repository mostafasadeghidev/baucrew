import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { detectAbsenceConflicts, detectConflicts } from '@/lib/schedule-conflicts'
import { getRainWarnings, OUTDOOR_CATEGORIES } from '@/lib/weather'
import { addDays, addMonths, iso, isoWeek, mondayOf, monthStart, utcDate } from '@/lib/dates'
import { MonthBoard } from './month-board'
import { ScheduleBoard, type BoardEntry } from './schedule-board'

const OPEN_STATUSES = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS'] as const

/**
 * Options for the project picker: all open projects plus the projects of the
 * assignments on the board — a completed project must keep its name in the
 * dialog (otherwise the field looks empty after "Projekt abschließen").
 */
function projectOptions(
  open: Array<{ id: string; number: string; name: string }>,
  entries: Array<{ project: { id: string; number: string; name: string } }>
): Array<{ value: string; label: string }> {
  const byId = new Map(open.map((p) => [p.id, `${p.number} — ${p.name}`]))
  for (const e of entries) {
    if (!byId.has(e.project.id)) byId.set(e.project.id, `${e.project.number} — ${e.project.name}`)
  }
  return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => b.label.localeCompare(a.label))
}


/** Absences overlapping [start, end) — feeds warnings in every view. */
function absencesBetween(start: Date, end: Date) {
  return db.absence.findMany({
    where: { startDate: { lt: end }, endDate: { gte: start } },
    select: { employeeId: true, startDate: true, endDate: true, type: true },
  })
}

type AbsenceHint = { employeeId: string; start: string; end: string; label: string }

const ENTRY_INCLUDE = {
  project: {
    select: {
      id: true,
      number: true,
      name: true,
      status: true,
      city: true,
      latitude: true,
      longitude: true,
      customer: { select: { name: true } },
      workCategories: { select: { workCategory: { select: { nameDe: true } } } },
    },
  },
  vehicles: { include: { vehicle: { select: { id: true, name: true, status: true } } } },
  employees: {
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, active: true } },
    },
  },
} as const

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; weekend?: string; weeks?: string }>
}) {
  await requireManagement()
  const { week, view, weekend } = await searchParams
  const [t, tVehicleStatus, tAbsences, locale] = await Promise.all([
    getTranslations('schedule'),
    getTranslations('vehicleStatus'),
    getTranslations('absences'),
    getLocale(),
  ])
  const absenceLabel = (type: string) => tAbsences(`type${type}` as 'typeVACATION')
  const toHints = (
    rows: Array<{ employeeId: string; startDate: Date; endDate: Date; type: string }>
  ): AbsenceHint[] =>
    rows.map((a) => ({
      employeeId: a.employeeId,
      start: iso(a.startDate),
      end: iso(a.endDate),
      label: absenceLabel(a.type),
    }))

  const base =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? utcDate(week) : new Date()
  const monday = mondayOf(base)

  if (view === 'month') {
    const start = monthStart(base)
    const gridStart = mondayOf(start)
    const gridEnd = addDays(mondayOf(addDays(addMonths(start, 1), -1)), 7)
    const [monthEntries, projects, employees, vehicles, monthAbsences] = await Promise.all([
      db.scheduleEntry.findMany({
        where: { date: { gte: gridStart, lt: gridEnd }, cancelledAt: null },
        include: ENTRY_INCLUDE,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      db.project.findMany({
        where: { status: { in: [...OPEN_STATUSES] } },
        orderBy: { number: 'desc' },
        select: { id: true, number: true, name: true },
      }),
      db.employee.findMany({ where: { active: true }, orderBy: { firstName: 'asc' }, select: { id: true, firstName: true, lastName: true } }),
      db.vehicle.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, status: true } }),
      absencesBetween(gridStart, gridEnd),
    ])
    // Sa/So columns only when the month actually has weekend assignments.
    const monthShowWeekend = monthEntries.some((e) => [0, 6].includes(e.date.getUTCDay()))
    const monthConflicts = [
      ...detectConflicts(monthEntries),
      ...detectAbsenceConflicts(monthEntries, monthAbsences),
    ]
    const conflicted = new Set(monthConflicts.flatMap((c) => c.entryIds))
    const dayCount = monthShowWeekend ? 7 : 5
    const weeks: string[][] = []
    for (let d = gridStart; d < gridEnd; d = addDays(d, 7)) {
      weeks.push(Array.from({ length: dayCount }, (_, i) => iso(addDays(d, i))))
    }
    const weekdayFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { weekday: 'short', timeZone: 'UTC' })
    const monthLabel = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start)
    return (
      <MonthBoard
        weeks={weeks}
        monthKey={iso(start).slice(0, 7)}
        monthLabel={monthLabel}
        weekdayLabels={weeks[0].map((d) => weekdayFmt.format(utcDate(d)))}
        weekNumbers={weeks.map((w) => isoWeek(utcDate(w[0])))}
        todayIso={iso(new Date())}
        prevHref={`/schedule?view=month&week=${iso(addMonths(start, -1))}`}
        nextHref={`/schedule?view=month&week=${iso(addMonths(start, 1))}`}
        currentHref="/schedule?view=month"
        weekHref={`/schedule?week=${iso(monday)}`}
        mapHref={`/schedule/map?date=${iso(monday)}`}
        entries={monthEntries.map((entry) => ({
          id: entry.id,
          date: iso(entry.date),
          projectId: entry.project.id,
          projectNumber: entry.project.number,
          projectName: entry.project.name,
          customerName: entry.project.customer.name,
          vehicles: entry.vehicles.map((ev) => ({ id: ev.vehicle.id, name: ev.vehicle.name })),
          startTime: entry.startTime ?? '',
          endTime: entry.endTime ?? '',
          note: entry.note ?? '',
          employees: entry.employees.map((ee) => ({ id: ee.employee.id, name: `${ee.employee.firstName} ${ee.employee.lastName}`.trim() })),
          hasConflict: conflicted.has(entry.id),
          projectStatus: entry.project.status,
        }))}
        projects={projectOptions(projects, monthEntries)}
        employees={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))}
        vehicles={vehicles.map((v) => ({ value: v.id, label: v.name }))}
        absences={toHints(monthAbsences)}
      />
    )
  }

  // Always load the full 7-day week; Saturday/Sunday columns are shown only
  // when an assignment falls on them (or when the user asks via ?weekend=1).
  const weekEnd = addDays(monday, 7)

  const [entries, projects, employees, vehicles, weekAbsences] = await Promise.all([
    db.scheduleEntry.findMany({
      where: { date: { gte: monday, lt: weekEnd }, cancelledAt: null },
      include: ENTRY_INCLUDE,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    }),
    db.project.findMany({
      where: { status: { in: [...OPEN_STATUSES] } },
      orderBy: { number: 'desc' },
      select: { id: true, number: true, name: true },
    }),
    db.employee.findMany({
      where: { active: true },
      orderBy: { firstName: 'asc' },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.vehicle.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, status: true },
    }),
    absencesBetween(monday, weekEnd),
  ])

  const hasWeekendEntries = entries.some((e) => [0, 6].includes(e.date.getUTCDay()))
  const showWeekend = hasWeekendEntries || weekend === '1'
  const days: string[] = Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => iso(addDays(monday, i)))

  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
  const conflicts = [...detectConflicts(entries), ...detectAbsenceConflicts(entries, weekAbsences)]
  const conflictedEntryIds = new Set(conflicts.flatMap((c) => c.entryIds))
  const conflictMessages = conflicts.map((c) =>
    c.type === 'employee'
      ? t('employeeConflict', { name: c.name, date: dateFmt.format(c.date) })
      : c.type === 'vehicle'
        ? t('vehicleConflict', { name: c.name, date: dateFmt.format(c.date) })
        : c.type === 'absence'
          ? t('absentConflict', {
              name: c.name,
              date: dateFmt.format(c.date),
              type: absenceLabel(c.absenceType),
            })
          : t('vehicleUnavailable', {
            name: c.name,
            date: dateFmt.format(c.date),
            status: tVehicleStatus(c.status),
          })
  )

  // Weather advisories for outdoor work (warning only — the manager decides).
  const outdoorPairs = entries
    .filter(
      (entry) =>
        entry.project.city &&
        entry.project.workCategories.some((wc) => OUTDOOR_CATEGORIES.includes(wc.workCategory.nameDe))
    )
    .map((entry) => ({
      city: entry.project.city!,
      date: iso(entry.date),
      entry,
      latitude: entry.project.latitude,
      longitude: entry.project.longitude,
    }))
  const rainWarnings = await getRainWarnings(outdoorPairs)
  const weatherMessages = rainWarnings.flatMap((w) =>
    outdoorPairs
      .filter((p) => p.city === w.city && p.date === w.date)
      .map((p) =>
        t('weatherWarning', {
          project: p.entry.project.name,
          city: w.city,
          date: dateFmt.format(p.entry.date),
          probability: w.probability,
        })
      )
  )

  const boardEntries: BoardEntry[] = entries.map((entry) => ({
    id: entry.id,
    date: iso(entry.date),
    projectId: entry.project.id,
    projectNumber: entry.project.number,
    projectName: entry.project.name,
    customerName: entry.project.customer.name,
    vehicles: entry.vehicles.map((ev) => ({ id: ev.vehicle.id, name: ev.vehicle.name })),
    startTime: entry.startTime ?? '',
    endTime: entry.endTime ?? '',
    note: entry.note ?? '',
    employees: entry.employees.map((ee) => ({
      id: ee.employee.id,
      name: `${ee.employee.firstName} ${ee.employee.lastName}`.trim(),
    })),
    hasConflict: conflictedEntryIds.has(entry.id),
    projectStatus: entry.project.status,
  }))

  return (
    <ScheduleBoard
      days={days}
      weekendToggle={
        hasWeekendEntries
          ? { href: null, active: true }
          : showWeekend
            ? { href: `/schedule?week=${iso(monday)}`, active: true }
            : { href: `/schedule?week=${iso(monday)}&weekend=1`, active: false }
      }
      weekNumber={isoWeek(monday)}
      prevWeekHref={`/schedule?week=${iso(addDays(monday, -7))}`}
      nextWeekHref={`/schedule?week=${iso(addDays(monday, 7))}`}
      currentWeekHref="/schedule"
      monthHref={`/schedule?view=month&week=${iso(monday)}`}
      mapHref={`/schedule/map?date=${iso(monday)}`}
      todayIso={iso(new Date())}
      entries={boardEntries}
      conflictMessages={conflictMessages}
      weatherMessages={weatherMessages}
      projects={projectOptions(projects, entries)}
      employees={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))}
      vehicles={vehicles.map((v) => ({
        value: v.id,
        label: v.status === 'AVAILABLE' ? v.name : `${v.name} (${tVehicleStatus(v.status)})`,
      }))}
      absences={toHints(weekAbsences)}
      locale={locale}
    />
  )
}


