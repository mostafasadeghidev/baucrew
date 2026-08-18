import Link from 'next/link'
import { BackLink } from '@/components/back-link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { StatusBadge } from '@/components/status-badge'
import { VEHICLE_STATUS_STYLES } from '@/components/vehicle-status-badge'
import { QuickStatus } from '@/components/quick-status'
import { VehicleStatus } from '@/generated/prisma/enums'
import { DeleteButton } from '@/components/delete-button'
import { formatDate } from '@/lib/format'
import { deleteVehicle, setVehicleStatus } from '../actions'

function todayUtc() {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [t, tc, tStatus, locale] = await Promise.all([
    getTranslations('vehicles'),
    getTranslations('common'),
    getTranslations('vehicleStatus'),
    getLocale(),
  ])

  const vehicle = await db.vehicle.findUnique({
    where: { id },
    include: {
      projects: {
        orderBy: { project: { number: 'desc' } },
        select: { project: { select: { id: true, number: true, name: true, status: true } } },
      },
      scheduleEntries: {
        where: { scheduleEntry: { date: { gte: todayUtc() } } },
        orderBy: { scheduleEntry: { date: 'asc' } },
        take: 14,
        include: {
          scheduleEntry: {
            include: {
              project: { select: { id: true, number: true, name: true } },
              employees: { include: { employee: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      },
    },
  })
  if (!vehicle) notFound()
  const upcoming = vehicle.scheduleEntries.map((sv) => sv.scheduleEntry)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackLink href="/vehicles" label={t('title')} />
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{vehicle.name}</h1>
            <QuickStatus
              value={vehicle.status}
              ariaLabel={t('status')}
              colorClass={VEHICLE_STATUS_STYLES[vehicle.status]}
              options={(Object.keys(VehicleStatus) as VehicleStatus[]).map((s) => ({
                value: s,
                label: tStatus(s),
              }))}
              onChange={setVehicleStatus.bind(null, vehicle.id)}
            />
            {!vehicle.active && (
              <span className="rounded-full bg-neutral-500/15 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                {tc('inactive')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/vehicles/${vehicle.id}/edit`}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
          >
            {tc('edit')}
          </Link>
          <DeleteButton
            action={deleteVehicle.bind(null, vehicle.id)}
            label={tc('delete')}
            confirmMessage={t('deleteConfirm')}
            errorLabels={{ cannotDeleteInUse: t('cannotDeleteInUse') }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold">{t('details')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 text-muted">{t('licensePlate')}</dt>
              <dd>{vehicle.licensePlate ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 text-muted">{t('type')}</dt>
              <dd>{vehicle.type ?? '—'}</dd>
            </div>
          </dl>
          {vehicle.notes && (
            <>
              <h3 className="mt-4 text-sm font-semibold">{t('notes')}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{vehicle.notes}</p>
            </>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">
            {t('upcomingTitle')}
          </h2>
          {upcoming.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">{t('noUpcoming')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                  <span className="font-medium tabular-nums">{formatDate(entry.date, locale)}</span>
                  <Link href={`/projects/${entry.project.id}`} className="text-accent hover:underline">
                    {entry.project.number} — {entry.project.name}
                  </Link>
                  <span className="text-muted">
                    {entry.employees
                      .map((ee) => `${ee.employee.firstName} ${ee.employee.lastName}`)
                      .join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">{t('projectsTitle')}</h2>
        {vehicle.projects.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">{t('noProjects')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {vehicle.projects.map(({ project: p }) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link href={`/projects/${p.id}`} className="font-medium text-accent hover:underline">
                  {p.number} — {p.name}
                </Link>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
