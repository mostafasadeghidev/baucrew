import Link from 'next/link'
import { BackLink } from '@/components/back-link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { STATUS_STYLES } from '@/components/status-badge'
import { QuickStatus } from '@/components/quick-status'
import { ReopenButton } from './reopen-button'
import { ProjectStatus } from '@/generated/prisma/enums'
import { DeleteButton } from '@/components/delete-button'
import { formatCurrency, formatDate } from '@/lib/format'
import { deleteProject, setProjectStatus } from '../actions'
import { ProjectItemsEditor, type ProjectItemRow } from './project-items'
import { PlanEntryButton } from './plan-entry-button'
import { ChecklistSection } from './checklist-section'
import { FilesCard } from './files-card'
import { btn } from '@/components/ui/button'
import { getOptionLists } from '@/lib/option-lists-db'
import { optionLabel } from '@/lib/option-lists'
import { ProjectAddOns } from './add-ons'
import { ProjectTimeSummary } from './time-summary'
import { daysOut } from '@/lib/devices'
import { ProjectDevicesEditor } from './project-devices'
import { getProjectDevices } from '../../devices/actions'
import { orderValue } from '@/lib/reports'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireManagement()
  const { id } = await params
  const [t, tc, tSheet, tStatus, tChecklists, tDevices, locale, lists] = await Promise.all([
    getTranslations('projects'),
    getTranslations('common'),
    getTranslations('sheet'),
    getTranslations('status'),
    getTranslations('checklists'),
    getTranslations('devices'),
    getLocale(),
    getOptionLists(),
  ])

  const project = await db.project.findUnique({
    where: { id },
    include: {
      customer: true,
      manager: true,
      vehicles: { include: { vehicle: true } },
      addOns: { orderBy: { date: 'asc' } },
      // Lines of the year-planning sheet someone tied to this project.
      planEntries: { orderBy: [{ year: 'asc' }, { month: 'asc' }] },
      documents: {
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { username: true } } },
      },
      workCategories: { include: { workCategory: true } },
      team: { include: { employee: true }, orderBy: { createdAt: 'asc' } },
      items: { include: { catalogItem: true }, orderBy: { catalogItem: { name: 'asc' } } },
      devices: {
        where: { returnedAt: null },
        include: { device: { select: { id: true, name: true, inventoryNo: true } } },
        orderBy: { takenAt: 'asc' },
      },
      timeEntries: {
        orderBy: { startedAt: 'desc' },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      },
      checklists: {
        orderBy: { createdAt: 'asc' },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { checkedBy: { select: { firstName: true, lastName: true } } },
          },
        },
      },
      scheduleEntries: {
        where: { cancelledAt: null },
        orderBy: { date: 'asc' },
        include: {
          vehicles: { include: { vehicle: true } },
          employees: { include: { employee: true } },
        },
      },
    },
  })
  if (!project) notFound()

  const [allEmployees, allVehicles, checklistTemplates] = await Promise.all([
    db.employee.findMany({ where: { active: true }, orderBy: { firstName: 'asc' }, select: { id: true, firstName: true, lastName: true } }),
    db.vehicle.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.checklistTemplate.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
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

  const { rows: deviceRows, options: deviceOptions } = await getProjectDevices(project.id)

  const itemRows: ProjectItemRow[] = project.items.map((item) => ({
    id: item.id,
    name: item.catalogItem.name,
    unit: item.catalogItem.unit,
    quantity: item.quantity != null ? Number(item.quantity) : null,
    stock: item.catalogItem.stockQuantity != null ? Number(item.catalogItem.stockQuantity) : null,
    status: item.status,
  }))

  const showPrice = canViewFinancials(user)
  const addOnTotal = project.addOns.reduce((sum, a) => sum + Number(a.amount), 0)
  // What the year-planning sheet had pencilled in for this project.
  const plannedTotal = project.planEntries.reduce((sum, e) => sum + Number(e.amount), 0)
  const orderTotal = orderValue(project.price, project.addOns)
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
          <div className="flex flex-wrap items-center gap-3">
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
        <div className="flex flex-wrap items-center gap-2">
          {['COMPLETED', 'INVOICED', 'PAID'].includes(project.status) && (
            <ReopenButton projectId={project.id} projectLabel={`${project.number} — ${project.name}`} />
          )}
          <Link
            href={`/projects/${project.id}/sheet`}
            className={btn.outlineSm}
          >
            {tSheet('title')}
          </Link>
          <Link
            href={`/projects/${project.id}/edit`}
            className={btn.outlineSm}
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
              <dd>{optionLabel(lists.clientTypes, project.clientType, locale) || '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 shrink-0 text-muted">{t('buildingType')}</dt>
              <dd>{optionLabel(lists.buildingTypes, project.buildingType, locale) || '—'}</dd>
            </div>
            {project.priority && (
              <div className="flex gap-2">
                <dt className="w-44 shrink-0 text-muted">{t('priority')}</dt>
                <dd
                  className={
                    project.priority === 'HIGH'
                      ? 'font-semibold text-red-700 dark:text-red-400'
                      : 'text-muted'
                  }
                >
                  {project.priority === 'HIGH' ? t('priorityHigh') : t('priorityLow')}
                </dd>
              </div>
            )}
            {project.leadSource && (
              <div className="flex gap-2">
                <dt className="w-44 shrink-0 text-muted">{t('leadSource')}</dt>
                <dd>{optionLabel(lists.leadSources, project.leadSource, locale) || project.leadSource}</dd>
              </div>
            )}
            {project.externalUrl && (
              <div className="flex gap-2">
                <dt className="w-44 shrink-0 text-muted">{t('externalSource')}</dt>
                <dd>
                  <a href={project.externalUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {project.externalSystem || t('externalSourceLink')} ↗
                  </a>
                </dd>
              </div>
            )}
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
                  {/* Follow-on offers raise the order value — show both. */}
                  {addOnTotal > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted">
                      + {formatCurrency(addOnTotal, locale)} {t('addOnsShort')} ={' '}
                      <span className="font-medium text-foreground">
                        {formatCurrency(orderValue(project.price, project.addOns), locale)}
                      </span>
                    </span>
                  )}
                </dd>
              </div>
            )}
            {showPrice && project.planEntries.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-44 shrink-0 text-muted">{t('plannedRevenue')}</dt>
                <dd className="tabular-nums">
                  {formatCurrency(plannedTotal, locale)}
                  <span className="ml-1 text-xs font-normal text-muted">
                    ({project.planEntries.map((e) => e.year).join(', ')})
                  </span>
                  {orderTotal != null && (
                    <span
                      className={`ml-2 text-xs font-medium ${
                        orderTotal >= plannedTotal
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {orderTotal >= plannedTotal ? '+' : '−'}
                      {formatCurrency(Math.abs(orderTotal - plannedTotal), locale)}
                    </span>
                  )}
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
        {showPrice && (
          <ProjectAddOns
            projectId={project.id}
            totalLabel={formatCurrency(addOnTotal, locale)}
            addOns={project.addOns.map((a) => ({
              id: a.id,
              label: a.label,
              amount: Number(a.amount),
              amountLabel: formatCurrency(Number(a.amount), locale),
              dateLabel: formatDate(a.date, locale),
            }))}
          />
        )}

        <section className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">{t('itemsTitle')}</h2>
          </div>
          <ProjectItemsEditor projectId={project.id} items={itemRows} options={catalogOptions} />
        </section>

        {/* Machines this site needs — same shape as the tools/materials list */}
        <section className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">{tDevices('needTitle')}</h2>
            <Link href="/devices" className={`${btn.outlineSm} px-2 py-0.5 text-xs text-muted`}>
              {tDevices('openDevices')} <span aria-hidden>→</span>
            </Link>
          </div>
          <ProjectDevicesEditor
            projectId={project.id}
            devices={deviceRows}
            options={deviceOptions}
          />
          {project.devices.length > 0 && (
            <div className="border-t border-border px-5 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {tDevices('onProject')}
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {project.devices.map((handout) => (
                  <li key={handout.id} className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/devices/${handout.device.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {handout.device.name}
                    </Link>
                    {handout.device.inventoryNo && (
                      <span className="text-xs tabular-nums text-muted">
                        {handout.device.inventoryNo}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {tDevices('sinceDays', { days: daysOut(handout.takenAt, new Date()) })}
                      {handout.note && ` · ${handout.note}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Hours booked on this project — plan vs. reality while it still runs */}
        <ProjectTimeSummary
          entries={project.timeEntries.map((e) => ({
            id: e.id,
            startedAt: e.startedAt,
            endedAt: e.endedAt,
            source: e.source,
            note: e.note,
            employee: e.employee,
          }))}
          orderValue={showPrice ? orderValue(project.price, project.addOns) : null}
          showPrice={showPrice}
        />

        {/* Site checklists — ticked off on site, saved with who and when */}
        <section className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">{tChecklists('title')}</h2>
            <p className="mt-0.5 text-xs text-muted">{tChecklists('hint')}</p>
          </div>
          <div className="p-5">
            <ChecklistSection
              projectId={project.id}
              templates={checklistTemplates}
              checklists={project.checklists.map((c) => ({
                id: c.id,
                name: c.name,
                items: c.items.map((i) => ({
                  id: i.id,
                  text: i.text,
                  ok: i.ok,
                  note: i.note,
                  checkedBy: i.checkedBy ? `${i.checkedBy.firstName} ${i.checkedBy.lastName}`.trim() : null,
                  checkedAt: i.checkedAt ? formatDate(i.checkedAt, locale) : null,
                })),
              }))}
            />
          </div>
        </section>

        <FilesCard
          projectId={project.id}
          files={project.documents.map((d) => ({
            id: d.id,
            filename: d.filename,
            size: d.size,
            source: d.source,
            visibleToCrew: d.visibleToCrew,
            createdAt: d.createdAt,
            uploadedBy: d.uploadedBy,
          }))}
        />

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
