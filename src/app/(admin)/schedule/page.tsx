import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { detectConflicts } from '@/lib/schedule-conflicts'
import { getRainWarnings, OUTDOOR_CATEGORIES } from '@/lib/weather'
import { addDays, addMonths, iso, isoWeek, mondayOf, monthStart, utcDate } from '@/lib/dates'
import { MonthBoard } from './month-board'
import { ScheduleBoard, type BoardEntry } from './schedule-board'
import { btn } from '@/components/ui/button'

const OPEN_STATUSES = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS'] as const
const OVERVIEW_WEEK_OPTIONS = [4, 6, 8, 12] as const
const DEFAULT_OVERVIEW_WEEKS = 6

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
  const { week, view, weekend, weeks: weeksParam } = await searchParams
  const [t, tVehicleStatus, locale] = await Promise.all([
    getTranslations('schedule'),
    getTranslations('vehicleStatus'),
    getLocale(),
  ])

  const base =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? utcDate(week) : new Date()
  const monday = mondayOf(base)

  if (view === 'month') {
    const start = monthStart(base)
    const gridStart = mondayOf(start)
    const gridEnd = addDays(mondayOf(addDays(addMonths(start, 1), -1)), 7)
    const [monthEntries, projects, employees, vehicles] = await Promise.all([
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
    ])
    // Sa/So columns only when the month actually has weekend assignments.
    const monthShowWeekend = monthEntries.some((e) => [0, 6].includes(e.date.getUTCDay()))
    const monthConflicts = detectConflicts(monthEntries)
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
        overviewHref={`/schedule?view=overview&week=${iso(monday)}`}
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
        projects={projects.map((p) => ({ value: p.id, label: `${p.number} — ${p.name}` }))}
        employees={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))}
        vehicles={vehicles.map((v) => ({ value: v.id, label: v.name }))}
      />
    )
  }

  if (view === 'overview') {
    return (
      <OverviewView
        monday={monday}
        weeksCount={OVERVIEW_WEEK_OPTIONS.includes(Number(weeksParam) as 4) ? Number(weeksParam) : DEFAULT_OVERVIEW_WEEKS}
        locale={locale}
        t={t}
      />
    )
  }

  // Always load the full 7-day week; Saturday/Sunday columns are shown only
  // when an assignment falls on them (or when the user asks via ?weekend=1).
  const weekEnd = addDays(monday, 7)

  const [entries, projects, employees, vehicles] = await Promise.all([
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
  const conflicts = detectConflicts(entries)
  const conflictedEntryIds = new Set(conflicts.flatMap((c) => c.entryIds))
  const conflictMessages = conflicts.map((c) =>
    c.type === 'employee'
      ? t('employeeConflict', { name: c.name, date: dateFmt.format(c.date) })
      : c.type === 'vehicle'
        ? t('vehicleConflict', { name: c.name, date: dateFmt.format(c.date) })
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
          ? null
          : showWeekend
            ? { href: `/schedule?week=${iso(monday)}`, active: true }
            : { href: `/schedule?week=${iso(monday)}&weekend=1`, active: false }
      }
      weekNumber={isoWeek(monday)}
      prevWeekHref={`/schedule?week=${iso(addDays(monday, -7))}`}
      nextWeekHref={`/schedule?week=${iso(addDays(monday, 7))}`}
      currentWeekHref="/schedule"
      overviewHref={`/schedule?view=overview&week=${iso(monday)}`}
      monthHref={`/schedule?view=month&week=${iso(monday)}`}
      todayIso={iso(new Date())}
      entries={boardEntries}
      conflictMessages={conflictMessages}
      weatherMessages={weatherMessages}
      projects={projects.map((p) => ({ value: p.id, label: `${p.number} — ${p.name}` }))}
      employees={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))}
      vehicles={vehicles.map((v) => ({
        value: v.id,
        label: v.status === 'AVAILABLE' ? v.name : `${v.name} (${tVehicleStatus(v.status)})`,
      }))}
      locale={locale}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Multi-week overview — same visual language as the paper
// Wochenplan: per week, one condensed row per project with a
// weekday range (Mo.–Mi.), vehicle and conflict badge.
// ─────────────────────────────────────────────────────────────

async function OverviewView({
  monday,
  weeksCount,
  locale,
  t,
}: {
  monday: Date
  weeksCount: number
  locale: string
  t: Awaited<ReturnType<typeof getTranslations<'schedule'>>>
}) {
  const overviewEnd = addDays(monday, weeksCount * 7)
  const entries = await db.scheduleEntry.findMany({
    where: { date: { gte: monday, lt: overviewEnd } },
    include: ENTRY_INCLUDE,
    orderBy: { date: 'asc' },
  })

  const weekdayFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    timeZone: 'UTC',
  })
  const dayMonthFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

  type WeekSummary = {
    mondayIso: string
    weekNumber: number
    rangeLabel: string
    conflictCount: number
    isCurrent: boolean
    projects: Array<{
      id: string
      name: string
      customer: string
      daysLabel: string
      vehicles: string[]
      hasConflict: boolean
    }>
  }

  const currentMondayIso = iso(mondayOf(new Date()))
  const weeks: WeekSummary[] = []

  for (let w = 0; w < weeksCount; w++) {
    const start = addDays(monday, w * 7)
    const end = addDays(start, 7)
    const weekEntries = entries.filter((e) => e.date >= start && e.date < end)
    const conflicts = detectConflicts(weekEntries)
    const conflictedEntryIds = new Set(conflicts.flatMap((c) => c.entryIds))

    const byProject = new Map<
      string,
      { name: string; customer: string; dates: Date[]; vehicles: Set<string>; hasConflict: boolean }
    >()
    for (const entry of weekEntries) {
      const existing = byProject.get(entry.project.id) ?? {
        name: entry.project.name,
        customer: entry.project.customer.name,
        dates: [],
        vehicles: new Set<string>(),
        hasConflict: false,
      }
      existing.dates.push(entry.date)
      for (const ev of entry.vehicles) existing.vehicles.add(ev.vehicle.name)
      if (conflictedEntryIds.has(entry.id)) existing.hasConflict = true
      byProject.set(entry.project.id, existing)
    }

    // Collapse the scheduled dates into ranges like "Mo.–Mi." or "Mo., Do."
    const projectRows = [...byProject.entries()].map(([id, p]) => {
      const dayIdx = [...new Set(p.dates.map((d) => Math.round((d.getTime() - start.getTime()) / 86400000)))].sort(
        (a, b) => a - b
      )
      const ranges: string[] = []
      let i = 0
      while (i < dayIdx.length) {
        let j = i
        while (j + 1 < dayIdx.length && dayIdx[j + 1] === dayIdx[j] + 1) j++
        const from = weekdayFmt.format(addDays(start, dayIdx[i]))
        const to = weekdayFmt.format(addDays(start, dayIdx[j]))
        ranges.push(i === j ? from : `${from}–${to}`)
        i = j + 1
      }
      return {
        id,
        name: p.name,
        customer: p.customer,
        daysLabel: ranges.join(', '),
        vehicles: [...p.vehicles],
        hasConflict: p.hasConflict,
      }
    })

    weeks.push({
      mondayIso: iso(start),
      weekNumber: isoWeek(start),
      rangeLabel: `${dayMonthFmt.format(start)} – ${dayMonthFmt.format(addDays(start, 4))}`,
      conflictCount: conflicts.length,
      isCurrent: iso(start) === currentMondayIso,
      projects: projectRows,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-subtle p-1 text-sm font-medium">
            <Link href={`/schedule?week=${weeks[0].mondayIso}`} className="rounded-md px-3 py-1 text-muted transition-colors hover:text-foreground">
              {t('viewWeek')}
            </Link>
            <Link href={`/schedule?view=month&week=${weeks[0].mondayIso}`} className="rounded-md px-3 py-1 text-muted transition-colors hover:text-foreground">
              {t('viewMonth')}
            </Link>
            <span className="rounded-md bg-surface px-3 py-1 text-foreground shadow-sm">{t('viewOverview')}</span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href={`/schedule?view=overview&week=${iso(addDays(monday, -7))}&weeks=${weeksCount}`}
              className={btn.outlineSm}
              title={t('prevWeek')}
            >
              ←
            </Link>
            <Link
              href={`/schedule?view=overview&weeks=${weeksCount}`}
              className={btn.outlineSm}
            >
              {t('currentWeek')}
            </Link>
            <Link
              href={`/schedule?view=overview&week=${iso(addDays(monday, 7))}&weeks=${weeksCount}`}
              className={btn.outlineSm}
              title={t('nextWeek')}
            >
              →
            </Link>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-subtle p-1 text-sm font-medium">
            {OVERVIEW_WEEK_OPTIONS.map((n) => (
              <Link
                key={n}
                href={`/schedule?view=overview&week=${iso(monday)}&weeks=${n}`}
                className={`rounded-md px-2.5 py-1 ${n === weeksCount ? 'bg-surface text-foreground shadow-sm' : 'text-muted transition-colors hover:text-foreground'}`}
                title={t('weeksShown', { count: n })}
              >
                {n}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {weeks.map((week) => (
          <Link
            key={week.mondayIso}
            href={`/schedule?week=${week.mondayIso}`}
            title={t('openWeek')}
            className={`flex flex-col rounded-lg border bg-surface shadow-sm transition-colors hover:border-accent ${
              week.isCurrent ? 'border-accent' : 'border-border'
            }`}
          >
            <div
              className={`flex items-center justify-between border-b border-border px-4 py-3 ${
                week.isCurrent ? 'bg-accent/10' : ''
              }`}
            >
              <div>
                <p className={`text-sm font-semibold ${week.isCurrent ? 'text-accent' : ''}`}>
                  {t('weekLabel', { week: week.weekNumber })}
                </p>
                <p className="text-xs text-muted">{week.rangeLabel}</p>
              </div>
              {week.conflictCount > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  ⚠ {t('conflictCount', { count: week.conflictCount })}
                </span>
              )}
            </div>
            <div className="flex-1 space-y-2 p-3">
              {week.projects.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">{t('noEntries')}</p>
              ) : (
                week.projects.map((p) => (
                  <div
                    key={p.id}
                    className={`rounded-md border px-2.5 py-1.5 text-xs ${
                      p.hasConflict ? 'border-amber-500/60 bg-amber-500/10' : 'border-border bg-background'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold">
                        {p.hasConflict && '⚠ '}
                        {p.name}
                      </p>
                      <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 font-medium tabular-nums">
                        {p.daysLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-muted">
                      {[p.customer, p.vehicles.join(', ')].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
