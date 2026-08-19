import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { detectConflicts } from '@/lib/schedule-conflicts'
import { getRainWarnings, OUTDOOR_CATEGORIES } from '@/lib/weather'
import { addDays, iso, isoWeek, mondayOf, todayUtc } from '@/lib/dates'
import { btn } from '@/components/ui/button'

export default async function DashboardPage() {
  const [t, tSchedule, locale] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('schedule'),
    getLocale(),
  ])
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
  const conflicts = detectConflicts(weekEntries)
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

  const stats = [
    { label: t('activeProjects'), value: activeProjects, href: '/projects?status=IN_PROGRESS' },
    { label: t('plannedProjects'), value: plannedProjects, href: '/projects?status=PLANNED' },
    { label: t('employeesToday'), value: employeesToday, href: '/dashboard/today#mitarbeiter' },
    { label: t('vehiclesToday'), value: vehiclesToday, href: '/dashboard/today#fahrzeuge' },
    { label: t('customers'), value: customerCount, href: '/customers' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted">
          {new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          }).format(new Date())}{' '}
          · {tSchedule('weekLabel', { week: isoWeek(today) })}
        </p>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Conflicts this week */}
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
                </li>
              ))}
              {conflicts.length > 6 && (
                <li className="text-muted">+{conflicts.length - 6}</li>
              )}
            </ul>
          )}
        </section>

        {/* Weather */}
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

        {/* Warehouse preparation today */}
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

        {/* Projects needing attention */}
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
      </div>

      {/* Today's assignments */}
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
    </div>
  )
}
