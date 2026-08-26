import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { detectAbsenceConflicts, detectConflicts } from '@/lib/schedule-conflicts'
import { getRainWarnings, OUTDOOR_CATEGORIES } from '@/lib/weather'
import { addDays, iso, isoWeek, mondayOf, todayUtc } from '@/lib/dates'
import { btn } from '@/components/ui/button'
import { canViewFinancials, requireManagement } from '@/lib/authz'
import { allowedLayout, parseLayout, type DashboardWidget } from '@/lib/dashboard-layout'
import { formatCurrency } from '@/lib/format'
import { getOpenOffers, getStockShortages, getYearRevenue, STALE_OFFER_DAYS } from '@/lib/reports'
import { WidgetFrame } from './widget-frame'
import { WidgetGrid } from './widget-grid'
import { resetDashboardLayout } from './actions'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  const [t, tSchedule, tAbsences, locale, user, sp] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('schedule'),
    getTranslations('absences'),
    getLocale(),
    requireManagement(),
    searchParams,
  ])
  // Every user arranges the overview for themselves; `edit` turns the handles on.
  const showMoney = canViewFinancials(user)
  const layout = allowedLayout(parseLayout(user.dashboardLayout), showMoney)
  const editing = sp.edit === '1'
  // A hidden card costs nothing: its query only runs when the card is shown.
  const live = new Set(layout.filter((w) => !w.hidden).map((w) => w.id))
  const needs = (id: DashboardWidget) => live.has(id)
  const today = todayUtc()
  const tomorrow = addDays(today, 1)
  const monday = mondayOf(today)
  const weekEnd = addDays(monday, 5)

  const [
    activeProjects,
    plannedProjects,
    customerCount,
    todayEntries,
    weekEntries,
    weekAbsences,
    attentionProjects,
  ] = await Promise.all([
    db.project.count({ where: { status: 'IN_PROGRESS' } }),
    db.project.count({ where: { status: 'PLANNED' } }),
    db.customer.count(),
    db.scheduleEntry.findMany({
      where: { date: { gte: today, lt: tomorrow }, cancelledAt: null },
      include: {
        project: {
          include: {
            customer: { select: { name: true } },
            items: { select: { status: true } },
          },
        },
        vehicles: { include: { vehicle: true } },
        employees: { include: { employee: true } },
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    }),
    db.scheduleEntry.findMany({
      where: { date: { gte: monday, lt: weekEnd }, cancelledAt: null },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            city: true,
            latitude: true,
            longitude: true,
            workCategories: { select: { workCategory: { select: { nameDe: true } } } },
          },
        },
        vehicles: { include: { vehicle: { select: { id: true, name: true, status: true } } } },
        employees: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
      },
    }),
    db.absence.findMany({
      where: { startDate: { lt: weekEnd }, endDate: { gte: monday } },
      select: { employeeId: true, startDate: true, endDate: true, type: true },
    }),
    // Planned/in-progress projects starting within 14 days that still lack a team or vehicle
    db.project.findMany({
      where: {
        status: { in: ['PLANNED', 'IN_PROGRESS', 'APPROVED'] },
        OR: [{ team: { none: {} } }, { vehicles: { none: {} } }],
        plannedStart: { lte: addDays(today, 14) },
      },
      select: {
        id: true,
        number: true,
        name: true,
        _count: { select: { team: true, vehicles: true } },
      },
      orderBy: { plannedStart: 'asc' },
      take: 8,
    }),
  ])

  const employeesToday = new Set(
    todayEntries.flatMap((e) => e.employees.map((ee) => ee.employeeId))
  ).size
  const vehiclesToday = new Set(
    todayEntries.flatMap((e) => e.vehicles.map((ev) => ev.vehicleId))
  ).size

  // ── This week's conflicts + weather ─────────────────────────
  const conflicts = [
    ...detectConflicts(weekEntries),
    ...detectAbsenceConflicts(weekEntries, weekAbsences),
  ]
  const outdoorPairs = weekEntries
    .filter(
      (e) =>
        e.project.city &&
        e.project.workCategories.some((wc) => OUTDOOR_CATEGORIES.includes(wc.workCategory.nameDe))
    )
    .map((e) => ({
      city: e.project.city!,
      date: iso(e.date),
      name: e.project.name,
      latitude: e.project.latitude,
      longitude: e.project.longitude,
    }))
  const rain = await getRainWarnings(outdoorPairs)
  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

  // ── Warehouse preparation for today ─────────────────────────
  const packing = todayEntries.map((e) => {
    const total = e.project.items.length
    const done = e.project.items.filter((i) => i.status === 'COLLECTED').length
    const missing = e.project.items.filter((i) => i.status === 'MISSING').length
    return { id: e.id, name: e.project.name, total, done, missing }
  })

  const monthIndex = today.getUTCMonth()
  const currentYear = today.getUTCFullYear()
  const entryInclude = {
    project: { select: { id: true, name: true, customer: { select: { name: true } } } },
    vehicles: { include: { vehicle: { select: { id: true, name: true } } } },
    employees: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
  } as const

  const [
    tomorrowEntries,
    checklistProblems,
    checklistProblemCount,
    dueProjects,
    stockShort,
    offers,
    revenueYear,
    revenuePrevYear,
  ] = await Promise.all([
    needs('tomorrow')
      ? db.scheduleEntry.findMany({
          where: { date: tomorrow, cancelledAt: null },
          include: entryInclude,
          orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
        })
      : [],
    needs('checklists')
      ? db.projectChecklistItem.findMany({
          where: { ok: false, checklist: { project: { status: { in: ['PLANNED', 'IN_PROGRESS', 'APPROVED'] } } } },
          select: {
            id: true,
            text: true,
            note: true,
            checklist: { select: { name: true, project: { select: { id: true, name: true } } } },
          },
          orderBy: { checkedAt: 'desc' },
          take: 6,
        })
      : [],
    needs('checklists')
      ? db.projectChecklistItem.count({
          where: { ok: false, checklist: { project: { status: { in: ['PLANNED', 'IN_PROGRESS', 'APPROVED'] } } } },
        })
      : 0,
    needs('dueThisWeek')
      ? db.project.findMany({
          where: {
            status: { in: ['PLANNED', 'IN_PROGRESS', 'APPROVED'] },
            plannedEnd: { not: null, lt: addDays(monday, 7) },
          },
          select: { id: true, number: true, name: true, plannedEnd: true },
          orderBy: { plannedEnd: 'asc' },
          take: 8,
        })
      : [],
    needs('stock') ? getStockShortages() : [],
    needs('offers') ? getOpenOffers() : null,
    needs('revenueMonth') ? getYearRevenue(currentYear) : null,
    // January compares against December of the year before.
    needs('revenueMonth') && monthIndex === 0 ? getYearRevenue(currentYear - 1) : null,
  ])

  const thisMonthRevenue = revenueYear?.months[monthIndex]?.total ?? 0
  const prevMonthRevenue =
    monthIndex === 0
      ? (revenuePrevYear?.months[11]?.total ?? 0)
      : (revenueYear?.months[monthIndex - 1]?.total ?? 0)
  const revenueChange =
    prevMonthRevenue > 0 ? Math.round(((thisMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100) : null
  const money = (value: number | null | undefined) => formatCurrency(value, locale)
  const monthFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { month: 'long', timeZone: 'UTC' })
  const weekDayFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
  const todayIso = iso(today)
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const day = addDays(monday, i)
    const key = iso(day)
    return {
      iso: key,
      label: weekDayFmt.format(day),
      isToday: key === todayIso,
      entries: weekEntries.filter((e) => iso(e.date) === key),
    }
  })
  const crewOf = (employees: Array<{ employee: { firstName: string; lastName: string } }>) =>
    employees.map((ee) => `${ee.employee.firstName} ${ee.employee.lastName}`.trim()).join(', ') || '—'

  const stats = [
    { label: t('activeProjects'), value: activeProjects, href: '/projects?status=IN_PROGRESS' },
    { label: t('plannedProjects'), value: plannedProjects, href: '/projects?status=PLANNED' },
    { label: t('employeesToday'), value: employeesToday, href: '/dashboard/today#mitarbeiter' },
    { label: t('vehiclesToday'), value: vehiclesToday, href: '/dashboard/today#fahrzeuge' },
    { label: t('customers'), value: customerCount, href: '/customers' },
  ]

  const widgets: Record<DashboardWidget, React.ReactNode> = {
    stats: (
<div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent"
          >
            <p className="text-sm text-muted">{s.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{s.value}</p>
          </Link>
        ))}
      </div>
    ),

    conflicts: (
<section
          className={`rounded-lg border p-4 shadow-sm ${
            conflicts.length > 0 ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-surface'
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {conflicts.length > 0 ? '⚠ ' : '✓ '}
              {t('conflictsThisWeek')}
            </h2>
            <Link href="/schedule" className={`${btn.outlineSm} px-2 py-0.5 text-xs text-muted`}>
              {t('openSchedule')} <span aria-hidden>→</span>
            </Link>
          </div>
          {conflicts.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t('noConflicts')}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {conflicts.slice(0, 6).map((c, i) => (
                <li key={i}>
                  <span className="font-medium">{c.name}</span> · {dateFmt.format(c.date)}
                  {c.type === 'absence' &&
                    ` · ${tAbsences(`type${c.absenceType}` as 'typeVACATION')}`}
                </li>
              ))}
              {conflicts.length > 6 && (
                <li className="text-muted">+{conflicts.length - 6}</li>
              )}
            </ul>
          )}
        </section>
    ),

    weather: (
<section
          className={`rounded-lg border p-4 shadow-sm ${
            rain.length > 0 ? 'border-sky-500/40 bg-sky-500/10' : 'border-border bg-surface'
          }`}
        >
          <h2 className="text-sm font-semibold">🌧 {t('weatherThisWeek')}</h2>
          {rain.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t('noWeatherWarnings')}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {rain.map((w) => {
                const names = outdoorPairs
                  .filter((p) => p.city === w.city && p.date === w.date)
                  .map((p) => p.name)
                return (
                  <li key={`${w.city}-${w.date}`}>
                    <span className="font-medium">{[...new Set(names)].join(', ')}</span> ·{' '}
                    {dateFmt.format(new Date(`${w.date}T00:00:00Z`))} · {w.city} · {w.probability}%
                  </li>
                )
              })}
            </ul>
          )}
        </section>
    ),

    packing: (
<section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t('packingToday')}</h2>
            <Link href="/dashboard/packing" className={`${btn.outlineSm} px-2 py-0.5 text-xs text-muted`}>
              {t('openPacking')} <span aria-hidden>→</span>
            </Link>
          </div>
          {packing.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">{t('noEntriesToday')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {packing.map((p) => {
                const pct = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100)
                const complete = p.total > 0 && p.done === p.total
                return (
                  <li key={p.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      <span
                        className={`shrink-0 text-xs font-semibold ${
                          complete
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : p.missing > 0
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-muted'
                        }`}
                      >
                        {p.total === 0
                          ? t('noItems')
                          : complete
                            ? t('allPacked')
                            : t('packedOf', { done: p.done, total: p.total })}
                        {p.missing > 0 && ` · ${t('missingCount', { count: p.missing })}`}
                      </span>
                    </div>
                    {p.total > 0 && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-hover">
                        <div
                          className={`h-full rounded-full ${complete ? 'bg-emerald-600' : 'bg-accent'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
    ),

    attention: (
<section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
            {t('needsAttention')}
          </h2>
          {attentionProjects.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">{t('nothingNeedsAttention')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {attentionProjects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <Link href={`/projects/${p.id}`} className="truncate font-medium text-accent hover:underline">
                    {p.number} — {p.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">
                    {[
                      p._count.team === 0 ? t('noTeam') : null,
                      p._count.vehicles === 0 ? t('noVehicleAssigned') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
    ),

    today: (
<section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t('todaysSchedule')}</h2>
        {todayEntries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('noEntriesToday')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {todayEntries.map((entry) => (
              <li key={entry.id} className="px-4 py-3 text-sm">
                {/* Time + project on top, the details as labelled rows below —
                    much easier to scan than one long line. */}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {(entry.startTime || entry.endTime) && (
                    <span className="tabular-nums text-muted">
                      {[entry.startTime, entry.endTime].filter(Boolean).join('–')}
                    </span>
                  )}
                  <Link href={`/projects/${entry.project.id}`} className="font-medium text-accent hover:underline">
                    {entry.project.name}
                  </Link>
                  <span className="text-muted">· {entry.project.customer.name}</span>
                </div>
                <dl className="mt-1 space-y-0.5 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted">{t('vehicle')}</dt>
                    <dd className="min-w-0">
                      {entry.vehicles.map((ev) => ev.vehicle.name).join(', ') || t('noVehicle')}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted">{t('team')}</dt>
                    <dd className="min-w-0">
                      {entry.employees
                        .map((ee) => `${ee.employee.firstName} ${ee.employee.lastName}`.trim())
                        .join(', ') || '—'}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),

    tomorrow: (
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t('tomorrowSchedule')}</h2>
        {tomorrowEntries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('noEntriesTomorrow')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {tomorrowEntries.map((entry) => (
              <li key={entry.id} className="px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {(entry.startTime || entry.endTime) && (
                    <span className="tabular-nums text-xs text-muted">
                      {[entry.startTime, entry.endTime].filter(Boolean).join('–')}
                    </span>
                  )}
                  <Link href={`/projects/${entry.project.id}`} className="truncate font-medium text-accent hover:underline">
                    {entry.project.name}
                  </Link>
                </div>
                <p className="text-xs text-muted">
                  {crewOf(entry.employees)}
                  {entry.vehicles.length > 0 && ` · ${entry.vehicles.map((ev) => ev.vehicle.name).join(', ')}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),

    week: (
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('weekAtAGlance')}</h2>
          <Link href="/schedule" className={`${btn.outlineSm} px-2 py-0.5 text-xs text-muted`}>
            {t('openSchedule')} <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
          {weekDays.map((day) => (
            <div key={day.iso} className={`px-3 py-2.5 ${day.isToday ? 'bg-accent/5' : ''}`}>
              <p className="text-xs font-semibold text-muted">{day.label}</p>
              {day.entries.length === 0 ? (
                <p className="mt-1 text-xs text-muted">—</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {day.entries.slice(0, 4).map((entry) => (
                    <li key={entry.id} className="truncate">
                      {entry.project.name}
                    </li>
                  ))}
                  {day.entries.length > 4 && (
                    <li className="text-muted">+{day.entries.length - 4}</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    ),

    checklists: (
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('checklistProblems')}</h2>
          {checklistProblemCount > 0 && (
            <span className="text-xs font-semibold text-red-700 dark:text-red-400">{checklistProblemCount}</span>
          )}
        </div>
        {checklistProblems.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('noChecklistProblems')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {checklistProblems.map((item) => (
              <li key={item.id} className="px-4 py-2.5 text-sm">
                <Link
                  href={`/projects/${item.checklist.project.id}`}
                  className="truncate font-medium text-accent hover:underline"
                >
                  {item.checklist.project.name}
                </Link>
                <p className="text-xs text-muted">
                  {item.text}
                  {item.note && ` — ${item.note}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),

    offers: (
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('openOffersTitle')}</h2>
          <Link href="/reports?tab=offers" className={`${btn.outlineSm} px-2 py-0.5 text-xs text-muted`}>
            {t('openReports')} <span aria-hidden>→</span>
          </Link>
        </div>
        {!offers || offers.offers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('noOpenOffers')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-3">
              <p className="text-2xl font-semibold tabular-nums">{money(offers.total)}</p>
              <p className="text-xs text-muted">
                {t('offersCount', { count: offers.offers.length })}
                {offers.staleCount > 0 &&
                  ` · ${t('offersStale', { count: offers.staleCount, days: STALE_OFFER_DAYS })}`}
              </p>
            </div>
            <ul className="divide-y divide-border border-t border-border">
              {offers.offers.slice(0, 4).map((offer) => (
                <li key={offer.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                  <Link href={`/projects/${offer.id}`} className="truncate text-accent hover:underline">
                    {offer.number} — {offer.name}
                  </Link>
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      offer.ageDays >= STALE_OFFER_DAYS ? 'text-red-700 dark:text-red-400' : 'text-muted'
                    }`}
                  >
                    {t('daysWaiting', { count: offer.ageDays })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    ),

    revenueMonth: (
      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('revenueThisMonth')}</h2>
          <Link href="/reports" className={`${btn.outlineSm} px-2 py-0.5 text-xs text-muted`}>
            {t('openReports')} <span aria-hidden>→</span>
          </Link>
        </div>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{money(thisMonthRevenue)}</p>
        <p className="mt-1 text-xs text-muted">
          {monthFmt.format(today)}
          {' · '}
          {revenueChange == null
            ? t('noPrevMonth')
            : `${revenueChange >= 0 ? '▲' : '▼'} ${Math.abs(revenueChange)} % ${t('vsPrevMonth')} (${money(prevMonthRevenue)})`}
        </p>
      </section>
    ),

    dueThisWeek: (
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t('dueThisWeek')}</h2>
        {dueProjects.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('nothingDue')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {dueProjects.map((project) => {
              const overdue = project.plannedEnd != null && iso(project.plannedEnd) < todayIso
              return (
                <li key={project.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <Link href={`/projects/${project.id}`} className="truncate font-medium text-accent hover:underline">
                    {project.number} — {project.name}
                  </Link>
                  <span
                    className={`shrink-0 text-xs ${overdue ? 'font-semibold text-red-700 dark:text-red-400' : 'text-muted'}`}
                  >
                    {project.plannedEnd && dateFmt.format(project.plannedEnd)}
                    {overdue && ` · ${t('overdue')}`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    ),

    stock: (
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('stockShortTitle')}</h2>
          <Link href="/warehouse" className={`${btn.outlineSm} px-2 py-0.5 text-xs text-muted`}>
            {t('openWarehouseList')} <span aria-hidden>→</span>
          </Link>
        </div>
        {stockShort.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('noStockShort')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {stockShort.slice(0, 6).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-amber-700 dark:text-amber-400">
                  {item.stock}
                  {item.unit ? ` ${item.unit}` : ''} / {item.need}
                  {item.unit ? ` ${item.unit}` : ''}
                </span>
              </li>
            ))}
            {stockShort.length > 6 && (
              <li className="px-4 py-2 text-xs text-muted">+{stockShort.length - 6}</li>
            )}
          </ul>
        )}
      </section>
    ),
  }

  const widgetTitles: Record<DashboardWidget, string> = {
    stats: t('widgetStats'),
    conflicts: t('conflictsThisWeek'),
    weather: t('weatherThisWeek'),
    packing: t('packingToday'),
    attention: t('needsAttention'),
    today: t('todaysSchedule'),
    tomorrow: t('tomorrowSchedule'),
    week: t('weekAtAGlance'),
    checklists: t('checklistProblems'),
    offers: t('openOffersTitle'),
    revenueMonth: t('revenueThisMonth'),
    dueThisWeek: t('dueThisWeek'),
    stock: t('stockShortTitle'),
  }

  const shown = editing ? layout : layout.filter((w) => !w.hidden)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-sm text-muted">
            {new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            }).format(new Date())}{' '}
            · {tSchedule('weekLabel', { week: isoWeek(today) })}
          </p>
          {editing ? (
            <span className="flex items-center gap-2">
              <form action={resetDashboardLayout}>
                <button type="submit" className={btn.outlineSm}>
                  {t('resetLayout')}
                </button>
              </form>
              <Link href="/dashboard" className={btn.primarySm}>
                {t('editDone')}
              </Link>
            </span>
          ) : (
            <Link href="/dashboard?edit=1" className={`${btn.outlineSm} gap-1.5`}>
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              {t('editLayout')}
            </Link>
          )}
        </div>
      </div>

      {editing && <p className="text-sm text-muted">{t('editHint')}</p>}

      {/* `key` resets the client order whenever the saved layout changes. */}
      <WidgetGrid
        key={shown.map((w) => w.id).join(',')}
        editing={editing}
        items={shown.map((w, i) => ({
          id: w.id,
          width: w.width,
          node: editing ? (
            <WidgetFrame
              layout={w}
              title={widgetTitles[w.id]}
              first={i === 0}
              last={i === shown.length - 1}
            >
              {widgets[w.id]}
            </WidgetFrame>
          ) : (
            widgets[w.id]
          ),
        }))}
      />
    </div>
  )
}
