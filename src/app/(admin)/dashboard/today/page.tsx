import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { addDays, iso, todayUtc, utcDate } from '@/lib/dates'
import { formatDate } from '@/lib/format'
import { BackLink } from '@/components/back-link'
import { VehicleStatusBadge } from '@/components/vehicle-status-badge'
import type { VehicleStatus } from '@/generated/prisma/enums'
import { btn } from '@/components/ui/button'

const card = 'overflow-hidden rounded-lg border border-border bg-surface shadow-sm'

/**
 * Dashboard sub page: who is working today (and with which vehicle) — one
 * row per employee / vehicle with the project(s) next to it.
 */
export default async function TodayOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireManagement()
  const { date: dateParam } = await searchParams
  const [t, tNav, tS, locale] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('nav'),
    getTranslations('schedule'),
    getLocale(),
  ])
  const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? utcDate(dateParam) : todayUtc()
  const next = addDays(day, 1)

  const entries = await db.scheduleEntry.findMany({
    where: { date: { gte: day, lt: next } },
    include: {
      project: { select: { id: true, number: true, name: true, city: true, customer: { select: { name: true } } } },
      employees: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
      vehicles: { include: { vehicle: { select: { id: true, name: true, status: true } } } },
    },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  })

  type Job = { projectId: string; number: string; name: string; time: string | null; city: string | null }
  const job = (e: (typeof entries)[number]): Job => ({
    projectId: e.project.id,
    number: e.project.number,
    name: e.project.name,
    time: e.startTime ? (e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime) : null,
    city: e.project.city,
  })

  const employees = new Map<string, { id: string; name: string; jobs: Job[]; vehicles: Set<string> }>()
  const vehicles = new Map<string, { id: string; name: string; status: string; jobs: Job[]; crew: Set<string> }>()
  for (const e of entries) {
    const j = job(e)
    const vehicleNames = e.vehicles.map((v) => v.vehicle.name)
    const crewNames = e.employees.map((x) => `${x.employee.firstName} ${x.employee.lastName}`.trim())
    for (const ee of e.employees) {
      const row = employees.get(ee.employee.id) ?? {
        id: ee.employee.id,
        name: `${ee.employee.firstName} ${ee.employee.lastName}`.trim(),
        jobs: [],
        vehicles: new Set<string>(),
      }
      row.jobs.push(j)
      vehicleNames.forEach((v) => row.vehicles.add(v))
      employees.set(ee.employee.id, row)
    }
    for (const ev of e.vehicles) {
      const row = vehicles.get(ev.vehicle.id) ?? {
        id: ev.vehicle.id,
        name: ev.vehicle.name,
        status: ev.vehicle.status,
        jobs: [],
        crew: new Set<string>(),
      }
      row.jobs.push(j)
      crewNames.forEach((c) => row.crew.add(c))
      vehicles.set(ev.vehicle.id, row)
    }
  }
  const employeeRows = [...employees.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const vehicleRows = [...vehicles.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const isToday = iso(day) === iso(todayUtc())
  const dayLabel = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(day)

  const JobList = ({ jobs }: { jobs: Job[] }) => (
    <ul className="space-y-0.5">
      {jobs.map((j, i) => (
        <li key={`${j.projectId}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <Link href={`/projects/${j.projectId}`} className="text-accent hover:underline">
            {j.number} — {j.name}
          </Link>
          <span className="text-xs text-muted">
            {[j.time, j.city].filter(Boolean).join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <BackLink href="/dashboard" label={tNav('dashboard')} />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('todayOverviewTitle')}{' '}
            <span className="text-base font-normal text-muted">
              {isToday ? `${t('todayWord')} · ` : ''}
              {dayLabel}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/dashboard/today?date=${iso(addDays(day, -1))}`}
            className={btn.outlineSm}
            aria-label={tS('prevWeek')}
          >
            ←
          </Link>
          <Link
            href="/dashboard/today"
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              isToday ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-surface-hover'
            }`}
          >
            {t('todayWord')}
          </Link>
          <Link
            href={`/dashboard/today?date=${iso(addDays(day, 1))}`}
            className={btn.outlineSm}
            aria-label={tS('nextWeek')}
          >
            →
          </Link>
          <Link
            href="/today"
            className={`${btn.outlineSm} ml-2`}
          >
            {t('openWarehouse')}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Employees */}
        <section id="mitarbeiter" className={card}>
          <h2 className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-semibold">
            {t('employeesToday')}
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium tabular-nums">
              {employeeRows.length}
            </span>
          </h2>
          {employeeRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">{t('noEntriesToday')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {employeeRows.map((row) => (
                <li key={row.id} className="grid grid-cols-[minmax(0,160px)_1fr] gap-3 px-4 py-2.5">
                  <div>
                    <Link href={`/employees/${row.id}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                    {row.vehicles.size > 0 && (
                      <p className="text-xs text-muted">{[...row.vehicles].join(', ')}</p>
                    )}
                  </div>
                  <JobList jobs={row.jobs} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Vehicles */}
        <section id="fahrzeuge" className={card}>
          <h2 className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-semibold">
            {t('vehiclesToday')}
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium tabular-nums">
              {vehicleRows.length}
            </span>
          </h2>
          {vehicleRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">{t('noEntriesToday')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {vehicleRows.map((row) => (
                <li key={row.id} className="grid grid-cols-[minmax(0,160px)_1fr] gap-3 px-4 py-2.5">
                  <div>
                    <Link href={`/vehicles/${row.id}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                    <div className="mt-0.5">
                      <VehicleStatusBadge status={row.status as VehicleStatus} />
                    </div>
                    {row.crew.size > 0 && <p className="mt-0.5 text-xs text-muted">{[...row.crew].join(', ')}</p>}
                  </div>
                  <JobList jobs={row.jobs} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-xs text-muted">{formatDate(day, locale)} · {entries.length} {t('entriesWord')}</p>
    </div>
  )
}
