import Link from 'next/link'
import { BackLink } from '@/components/back-link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { StatusBadge } from '@/components/status-badge'
import { DeleteButton } from '@/components/delete-button'
import { formatDate } from '@/lib/format'
import { deleteEmployee } from '../actions'
import { requireManagement } from '@/lib/authz'
import { AccountSection } from './account-section'
import { btn } from '@/components/ui/button'

function todayUtc() {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const viewer = await requireManagement()
  const [t, tc, locale] = await Promise.all([
    getTranslations('employees'),
    getTranslations('common'),
    getLocale(),
  ])

  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, role: true, canViewFinancials: true, active: true } },
      projectMemberships: {
        include: {
          project: {
            select: { id: true, number: true, name: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      scheduleEntries: {
        where: { scheduleEntry: { date: { gte: todayUtc() }, cancelledAt: null } },
        include: {
          scheduleEntry: {
            include: {
              project: { select: { id: true, number: true, name: true } },
              vehicles: { include: { vehicle: { select: { name: true } } } },
            },
          },
        },
        orderBy: { scheduleEntry: { date: 'asc' } },
        take: 14,
      },
    },
  })
  if (!employee) notFound()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackLink href="/employees" label={t('title')} />
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {employee.firstName} {employee.lastName}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                employee.active
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              {employee.active ? tc('active') : tc('inactive')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/employees/${employee.id}/edit`}
            className={btn.outlineSm}
          >
            {tc('edit')}
          </Link>
          <DeleteButton
            action={deleteEmployee.bind(null, employee.id)}
            label={tc('delete')}
            confirmMessage={t('deleteConfirm')}
            errorLabels={{ cannotDeleteInUse: t('cannotDeleteInUse') }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold">{t('contactData')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 text-muted">{t('phone')}</dt>
              <dd>{employee.phone ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 text-muted">{t('email')}</dt>
              <dd>{employee.email ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 text-muted">{t('skills')}</dt>
              <dd className="flex flex-wrap gap-1">
                {employee.skills.length === 0
                  ? '—'
                  : employee.skills.map((s) => (
                      <span key={s} className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium">
                        {s}
                      </span>
                    ))}
              </dd>
            </div>
          </dl>
          {employee.notes && (
            <>
              <h3 className="mt-4 text-sm font-semibold">{t('notes')}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{employee.notes}</p>
            </>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">
            {t('upcomingTitle')}
          </h2>
          {employee.scheduleEntries.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">{t('noUpcoming')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {employee.scheduleEntries.map((se) => (
                <li key={se.scheduleEntryId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                  <span className="font-medium tabular-nums">
                    {formatDate(se.scheduleEntry.date, locale)}
                  </span>
                  <Link
                    href={`/projects/${se.scheduleEntry.project.id}`}
                    className="text-accent hover:underline"
                  >
                    {se.scheduleEntry.project.number} — {se.scheduleEntry.project.name}
                  </Link>
                  {se.scheduleEntry.vehicles.length > 0 && (
                    <span className="text-muted">
                      {se.scheduleEntry.vehicles.map((ev) => ev.vehicle.name).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AccountSection
        employeeId={employee.id}
        account={employee.user}
        isAdmin={viewer.role === 'ADMIN'}
        isSelf={employee.user?.id === viewer.id}
      />

      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">{t('projectsTitle')}</h2>
        {employee.projectMemberships.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">{t('noProjects')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {employee.projectMemberships.map((m) => (
              <li key={m.projectId} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link href={`/projects/${m.project.id}`} className="font-medium text-accent hover:underline">
                  {m.project.number} — {m.project.name}
                </Link>
                <StatusBadge status={m.project.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
