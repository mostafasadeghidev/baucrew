import Link from 'next/link'
import { BackLink } from '@/components/back-link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { STATUS_STYLES } from '@/components/status-badge'
import { QuickStatus } from '@/components/quick-status'
import { ProjectStatus } from '@/generated/prisma/enums'
import { DeleteButton } from '@/components/delete-button'
import { formatCurrency, formatDate } from '@/lib/format'
import { deleteProject, setProjectStatus } from '../actions'
import { ProjectItemsEditor, type ProjectItemRow } from './project-items'
import { PlanEntryButton } from './plan-entry-button'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireManagement()
  const { id } = await params
  const [t, tc, tClient, tBuilding, tSheet, tStatus, locale] = await Promise.all([
    getTranslations('projects'),
    getTranslations('common'),
    getTranslations('clientType'),
    getTranslations('buildingType'),
    getTranslations('sheet'),
    getTranslations('status'),
    getLocale(),
  ])

  const project = await db.project.findUnique({
    where: { id },
    include: {
      customer: true,
      manager: true,
      vehicles: { include: { vehicle: true } },
      workCategories: { include: { workCategory: true } },
      team: { include: { employee: true }, orderBy: { createdAt: 'asc' } },
      items: { include: { catalogItem: true }, orderBy: { catalogItem: { name: 'asc' } } },
      scheduleEntries: {
        orderBy: { date: 'asc' },
        include: {
          vehicles: { include: { vehicle: true } },
          employees: { include: { employee: true } },
        },
      },
    },
  })
  if (!project) notFound()

  const [allEmployees, allVehicles] = await Promise.all([
    db.employee.findMany({ where: { active: true }, orderBy: { firstName: 'asc' }, select: { id: true, firstName: true, lastName: true } }),
    db.vehicle.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  const assignedItemIds = new Set(project.items.map((i) => i.catalogItemId))
  const catalogOptions = (
    await db.catalogItem.findMany({
      where: { active: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, unit: true },
    })
  )
    .filter((c) => !assignedItemIds.has(c.id))
    .map((c) => ({ value: c.id, label: c.unit ? `${c.name} (${c.unit})` : c.name }))

  const itemRows: ProjectItemRow[] = project.items.map((item) => ({
    id: item.id,
    name: item.catalogItem.name,
    unit: item.catalogItem.unit,
    quantity: item.quantity != null ? Number(item.quantity) : null,
    stock: item.catalogItem.stockQuantity != null ? Number(item.catalogItem.stockQuantity) : null,
    status: item.status,
  }))

  const showPrice = canViewFinancials(user)
  const categoryLabel = (c: { nameDe: string; nameEn: string }) =>
    locale === 'en' ? c.nameEn : c.nameDe

  const address = [
    project.street,
    [project.postalCode, project.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackLink href="/projects" label={t('title')} />
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="mr-2 text-muted">{project.number}</span>
              {project.name}
            </h1>
            <QuickStatus
              value={project.status}
              ariaLabel={t('status')}
              colorClass={STATUS_STYLES[project.status]}
              options={(Object.keys(ProjectStatus) as ProjectStatus[]).map((s) => ({
                value: s,
                label: tStatus(s),
              }))}
              onChange={setProjectStatus.bind(null, project.id)}
            />
          </div>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/customers/${project.customerId}`} className="text-accent hover:underline">
              {project.customer.name}
            </Link>
            {address && <> · {address}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${project.id}/sheet`}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
          >
            {tSheet('title')}
          </Link>
          <Link
            href={`/projects/${project.id}/edit`}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
          >
            {tc('edit')}
          </Link>
          {user.role === 'ADMIN' && (
            <DeleteButton
              action={deleteProject.bind(null, project.id)}
              label={tc('delete')}
              confirmMessage={t('deleteConfirm')}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Overview */}
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold">{t('overview')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('clientType')}</dt>
              <dd>{project.clientType ? tClient(project.clientType) : '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('buildingType')}</dt>
              <dd>{project.buildingType ? tBuilding(project.buildingType) : '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('workCategories')}</dt>
              <dd className="flex flex-wrap gap-1">
                {project.workCategories.length === 0
                  ? '—'
                  : project.workCategories.map((wc) => (
                      <span
                        key={wc.workCategoryId}
                        className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
                      >
                        {categoryLabel(wc.workCategory)}
                      </span>
                    ))}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('phone')}</dt>
              <dd>{project.phone ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('contact')}</dt>
              <dd>{project.contact ?? '—'}</dd>
            </div>
            {showPrice && (
              <div className="flex gap-2">
                <dt className="w-44 shrink-0 text-muted">{t('price')}</dt>
                <dd className="font-medium tabular-nums">
                  {formatCurrency(project.price ? Number(project.price) : null, locale)}
                </dd>
              </div>
            )}
          </dl>
          {project.description && (
            <p className="mt-4 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted">
              {project.description}
            </p>
          )}
        </section>

        {/* Dates & assignment */}
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold">{t('planning')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('plannedStart')}</dt>
              <dd className="tabular-nums">{formatDate(project.plannedStart, locale)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('plannedEnd')}</dt>
              <dd className="tabular-nums">{formatDate(project.plannedEnd, locale)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('actualStart')}</dt>
              <dd className="tabular-nums">{formatDate(project.actualStart, locale)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('actualEnd')}</dt>
              <dd className="tabular-nums">{formatDate(project.actualEnd, locale)}</dd>
            </div>
          </dl>
          <h2 className="mt-5 text-sm font-semibold">{t('assignmentSection')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('manager')}</dt>
              <dd>
                {project.manager ? `${project.manager.firstName} ${project.manager.lastName}` : '—'}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('vehicle')}</dt>
              <dd>{project.vehicles.length > 0 ? project.vehicles.map((pv) => pv.vehicle.name).join(', ') : '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('team')}</dt>
              <dd className="flex flex-wrap gap-1">
                {project.team.length === 0
                  ? '—'
                  : project.team.map((m) => (
                      <span
                        key={m.employeeId}
                        className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium"
                      >
                        {m.employee.firstName} {m.employee.lastName}
                      </span>
                    ))}
              </dd>
            </div>
          </dl>
        </section>

        {/* Tools & materials — no overflow-hidden: the picker dropdown must escape the card */}
        <section className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">{t('itemsTitle')}</h2>
          </div>
          <ProjectItemsEditor projectId={project.id} items={itemRows} options={catalogOptions} />
        </section>

        {/* Schedule (read-only until Phase 5) */}
        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">{t('scheduleTitle')}</h2>
            <PlanEntryButton
              projectId={project.id}
              projects={[{ value: project.id, label: `${project.number} — ${project.name}` }]}
              employees={allEmployees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))}
              vehicles={allVehicles.map((v) => ({ value: v.id, label: v.name }))}
            />
          </div>
          {project.scheduleEntries.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">{t('noScheduleEntries')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {project.scheduleEntries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                  <span className="font-medium tabular-nums">{formatDate(entry.date, locale)}</span>
                  {(entry.startTime || entry.endTime) && <span className="text-muted">{[entry.startTime, entry.endTime].filter(Boolean).join('–')}</span>}
                  {entry.vehicles.length > 0 && (
                    <span className="text-muted">
                      {entry.vehicles.map((ev) => ev.vehicle.name).join(', ')}
                    </span>
                  )}
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

      {project.internalNotes && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="text-sm font-semibold">{t('internalNotes')}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{project.internalNotes}</p>
        </section>
      )}
    </div>
  )
}
