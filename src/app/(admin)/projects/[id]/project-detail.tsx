import Link from 'next/link'
import { NoteText } from '@/components/ui/note-text'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { STATUS_STYLES } from '@/components/status-badge'
import { QuickStatus } from '@/components/quick-status'
import { ReopenButton } from './reopen-button'
import { ProjectStatus } from '@/generated/prisma/enums'
import { DeleteButton } from '@/components/delete-button'
import { formatCurrency, formatDate, toDateInputValue } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import { deleteProject, setProjectStatus, updateProject } from '../actions'
import { ProjectForm } from '../project-form'
import { ProjectBarActions } from './edit-all-button'
import { SheetClose } from '../card-sheet'
import { SheetAddBar } from '../sheet-add-bar'
import { LABEL_PILL, PERSON_SWATCH, SUB_LABEL, URGENT_LABEL } from '@/components/swatches'
import { todayUtc } from '@/lib/dates'
import { ProjectItemsEditor, type ProjectItemRow } from './project-items'
import { PlanEntryButton } from './plan-entry-button'
import { MergeButton } from './merge-button'
import { ChecklistSection } from './checklist-section'
import { FilesCard } from './files-card'
import { ProjectDefects } from '@/components/project-defects'
import { defectRows } from '@/lib/defects'
import { defectListSelect } from '@/lib/defects-db'
import { btn } from '@/components/ui/button'
import { getOptionLists } from '@/lib/option-lists-db'
import { optionLabel } from '@/lib/option-lists'
import { ProjectAddOns } from './add-ons'
import { ProjectInvoices, type InvoiceRow } from './invoices-card'
import { ProjectComments, type CommentRow } from '@/components/project-comments'
import { addProjectComment, deleteProjectComment } from './comment-actions'
import { displayName, mentionablePeople } from '@/lib/comments-db'
import { canDeleteComment } from '@/lib/comments'
import { Clock } from 'lucide-react'
import { dateTone, dueTone, initials, labelSwatch, swatchOf } from '@/lib/board-cards'
import { INVOICE_PARTS, suggestedInvoiceAmount } from '@/lib/invoices'
import { ProjectTimeSummary } from './time-summary'
import { daysOut } from '@/lib/devices'
import { ProjectDevicesEditor } from './project-devices'
import { getProjectDevices } from '../../devices/actions'
import { orderValue } from '@/lib/reports'

/** The bar's place in the card sheet: it holds to the top of the sheet's own scroll. */
function SheetHead({ children }: { children: React.ReactNode }) {
  return <div className="sticky top-0 z-20 -mt-2 bg-background pb-1 pt-2">{children}</div>
}

/**
 * A project, as its page shows it and as the board's card sheet shows it:
 * the same cards, the same forms — one place describes a project, however
 * many places show it. In the sheet the page's bar loses its way back and
 * sticks to the sheet instead of the window, a save returns to the board
 * with the sheet still open, and a project that is gone is a line rather
 * than a 404.
 */
export async function ProjectDetail({
  id,
  sheet = null,
}: {
  id: string
  /** Set when shown over the board: where a save and a cancel return to. */
  sheet?: { returnTo: string } | null
}) {
  const user = await requireManagement()
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
  const hidePrices = await pricesHidden()

  const project = await db.project.findUnique({
    where: { id },
    include: {
      customer: true,
      manager: true,
      vehicles: { include: { vehicle: true } },
      addOns: { orderBy: { date: 'asc' } },
      invoices: { include: { readyBy: { select: { username: true } } } },
      // Lines of the year-planning sheet someone tied to this project.
      planEntries: { orderBy: [{ year: 'asc' }, { month: 'asc' }] },
      documents: {
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { username: true } } },
      },
      workCategories: { include: { workCategory: true } },
      deviceNeeds: { select: { deviceId: true } },
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
      // What is not right on the site, with its photos.
      defects: { select: defectListSelect },
      // The team's comments, oldest first, with who wrote each.
      notes: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, username: true, employee: { select: { firstName: true, lastName: true } } } } },
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
  if (!project) {
    if (sheet)
      return (
        <div className="flex items-center justify-between gap-3">
          <p className="px-2 py-6 text-sm text-muted">{t('cardMissing')}</p>
          <SheetClose />
        </div>
      )
    notFound()
  }

  const [allEmployees, allVehicles, checklistTemplates, customers, allCategories, otherProjects, people] =
    await Promise.all([
    db.employee.findMany({ where: { active: true }, orderBy: { firstName: 'asc' }, select: { id: true, firstName: true, lastName: true } }),
    db.vehicle.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.checklistTemplate.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    db.customer.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        street: true,
        postalCode: true,
        city: true,
        phone: true,
        latitude: true,
        longitude: true,
      },
    }),
    db.workCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, nameDe: true, nameEn: true },
    }),
    // What a duplicate could be folded into this one — admins only.
    user.role === 'ADMIN'
      ? db.project.findMany({
          where: { id: { not: project.id }, status: { not: 'CANCELLED' } },
          orderBy: { number: 'desc' },
          select: { id: true, number: true, name: true },
        })
      : Promise.resolve([]),
    // Everybody a comment can name with @.
    mentionablePeople(),
  ])
  const stamp = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'short', timeStyle: 'short' })
  const comments: CommentRow[] = project.notes.map((note) => {
    const name = note.author ? displayName(note.author) : null
    return {
      id: note.id,
      body: note.body,
      when: stamp.format(note.createdAt),
      author: note.author && name ? { name, initials: initials(name), swatch: swatchOf(note.author.id) } : null,
      office: note.visibility === 'MANAGEMENT',
      deletable: canDeleteComment(user, note),
    }
  })
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
  const firstInvoice = project.invoices.find((i) => i.part === 1)
  const invoiceRows: InvoiceRow[] = INVOICE_PARTS.map((part) => {
    const invoice = project.invoices.find((i) => i.part === part)
    const suggested = suggestedInvoiceAmount(part, orderTotal, firstInvoice?.amount == null ? null : Number(firstInvoice.amount))
    return {
      part,
      ready: invoice
        ? {
            dateLabel: formatDate(invoice.readyAt, locale),
            byLabel: invoice.readyBy?.username ?? null,
            amountLabel: invoice.amount == null ? null : formatCurrency(Number(invoice.amount), locale, { hidden: hidePrices }),
            number: invoice.number,
          }
        : null,
      suggestedLabel: suggested == null ? null : formatCurrency(suggested, locale, { hidden: hidePrices }),
      suggestedInput: suggested == null ? '' : locale === 'en' ? suggested.toFixed(2) : suggested.toFixed(2).replace('.', ','),
    }
  })
  const categoryLabel = (c: { nameDe: string; nameEn: string }) =>
    locale === 'en' ? c.nameEn : c.nameDe

  const address = [
    project.street,
    [project.postalCode, project.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-2">
      <dt className="w-44 shrink-0 text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
  // Whether the day the work is due by presses — read in two places below.
  const due = dueTone(project.status, project.dueDate, todayUtc())
  /**
   * What each card shows while it is closed. The fields behind them are the
   * project form's own — see `ProjectForm`'s `inline` prop — so every field is
   * described in one place and edited in one place, however many pages show it.
   */
  const views = {
    basic: (
      <dl className="space-y-2 text-sm">
        {row(t('clientType'), optionLabel(lists.clientTypes, project.clientType, locale) || '—')}
        {row(t('buildingType'), optionLabel(lists.buildingTypes, project.buildingType, locale) || '—')}
        {row(
          t('priority'),
          project.priority ? (
            <span
              className={
                project.priority === 'HIGH'
                  ? 'font-semibold text-red-700 dark:text-red-400'
                  : 'text-muted'
              }
            >
              {project.priority === 'HIGH' ? t('priorityHigh') : t('priorityLow')}
            </span>
          ) : (
            t('priorityNormal')
          )
        )}
        {row(t('leadSource'), optionLabel(lists.leadSources, project.leadSource, locale) || '—')}
        {row(
          t('workCategories'),
          <span className="flex flex-wrap gap-1">
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
          </span>
        )}
        {row(t('isSub'), project.isSub ? tc('yes') : tc('no'))}
        {project.externalUrl &&
          row(
            t('externalSource'),
            <a
              href={project.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {project.externalSystem || t('externalSourceLink')} ↗
            </a>
          )}
      </dl>
    ),
    address: (
      <dl className="space-y-2 text-sm">
        {row(t('street'), project.street || '—')}
        {row(t('postalCode'), project.postalCode || '—')}
        {row(t('city'), project.city || '—')}
        {row(t('phone'), project.phone || '—')}
        {row(t('contact'), project.contact || '—')}
      </dl>
    ),
    planning: (
      <dl className="space-y-2 text-sm">
        {row(t('plannedStart'), <span className="tabular-nums">{formatDate(project.plannedStart, locale)}</span>)}
        {row(t('plannedEnd'), <span className="tabular-nums">{formatDate(project.plannedEnd, locale)}</span>)}
        {row(
          t('dueDate'),
          <span
            className={`rounded px-1 tabular-nums ${due === 'late' ? 'bg-danger/10 text-danger' : due === 'soon' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : ''}`}
            title={due === 'late' ? t('cardDueLate') : due === 'soon' ? t('cardDueSoon') : undefined}
          >
            {formatDate(project.dueDate, locale)}
          </span>
        )}
        {row(t('actualStart'), <span className="tabular-nums">{formatDate(project.actualStart, locale)}</span>)}
        {row(t('actualEnd'), <span className="tabular-nums">{formatDate(project.actualEnd, locale)}</span>)}
            {showPrice && (
              <div className="flex gap-2">
                <dt className="w-44 shrink-0 text-muted">{t('price')}</dt>
                <dd className="font-medium tabular-nums">
                  {formatCurrency(project.price ? Number(project.price) : null, locale, { hidden: hidePrices })}
                  {/* Follow-on offers raise the order value — show both. */}
                  {addOnTotal > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted">
                      + {formatCurrency(addOnTotal, locale, { hidden: hidePrices })} {t('addOnsShort')} ={' '}
                      <span className="font-medium text-foreground">
                        {formatCurrency(orderValue(project.price, project.addOns), locale, { hidden: hidePrices })}
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
                  {formatCurrency(plannedTotal, locale, { hidden: hidePrices })}
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
                      {formatCurrency(Math.abs(orderTotal - plannedTotal), locale, { hidden: hidePrices })}
                    </span>
                  )}
                </dd>
              </div>
            )}
      </dl>
    ),
    assignment: (
      <dl className="space-y-2 text-sm">
        {row(
          t('manager'),
          project.manager ? `${project.manager.firstName} ${project.manager.lastName}` : '—'
        )}
        {row(
          t('vehicle'),
          project.vehicles.length > 0 ? project.vehicles.map((pv) => pv.vehicle.name).join(', ') : '—'
        )}
        {row(
          t('team'),
          <span className="flex flex-wrap gap-1">
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
          </span>
        )}
      </dl>
    ),
    description: (
      <div className="space-y-3 text-sm">
        {project.description ? (
          <NoteText text={project.description} className="text-muted" />
        ) : (
          <p className="text-muted">—</p>
        )}
        {project.internalNotes && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold">{t('internalNotes')}</p>
            <NoteText text={project.internalNotes} className="mt-1 text-muted" />
          </div>
        )}
      </div>
    ),
  }

  /**
   * The cards of the project, with the talk about it in a column on their
   * right. The column takes its room from the cards, so they pair off one
   * step later than they would alone: on the page, which shares the window
   * with the sidebar, from 2xl; in the sheet, which has the window's width to
   * itself, from xl. Below the width the column appears at, the comments go
   * under the cards and the cards pair off as they always did.
   */
  const pairs = sheet ? 'md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2' : 'lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2'
  const body = (
    <>
      <ProjectForm
        action={updateProject.bind(null, project.id, sheet?.returnTo ?? null)}
        cancelHref={sheet?.returnTo ?? `/projects/${project.id}`}
        title={project.name}
        showPrice={showPrice}
        pairFrom={sheet ? 'xl' : '2xl'}
        inline={{
          views,
          labels: { edit: tc('edit'), save: tc('save'), cancel: tc('cancel') },
        }}
        customers={customers.map((c) => ({ value: c.id, label: c.name }))}
        customerAddresses={Object.fromEntries(
          customers.map((c) => [
            c.id,
            {
              street: c.street ?? '',
              postalCode: c.postalCode ?? '',
              city: c.city ?? '',
              phone: c.phone ?? '',
              latitude: c.latitude,
              longitude: c.longitude,
            },
          ])
        )}
        employees={allEmployees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))}
        vehicles={allVehicles.map((v) => ({ value: v.id, label: v.name }))}
        checklists={checklistTemplates.map((c) => ({ value: c.id, label: c.name }))}
        devices={deviceOptions}
        leadSources={lists.leadSources.map((e) => ({ value: e.value, label: optionLabel(lists.leadSources, e.value, locale) }))}
        clientTypes={lists.clientTypes.map((e) => ({ value: e.value, label: optionLabel(lists.clientTypes, e.value, locale) }))}
        buildingTypes={lists.buildingTypes.map((e) => ({ value: e.value, label: optionLabel(lists.buildingTypes, e.value, locale) }))}
        categories={allCategories.map((c) => ({ value: c.id, label: categoryLabel(c) }))}
        initial={{
          name: project.name,
          customerId: project.customerId,
          status: project.status,
          isSub: project.isSub,
          clientType: project.clientType ?? '',
          priority: project.priority ?? '',
          leadSource: project.leadSource ?? '',
          buildingType: project.buildingType ?? '',
          street: project.street ?? '',
          postalCode: project.postalCode ?? '',
          city: project.city ?? '',
          latitude: project.latitude,
          longitude: project.longitude,
          phone: project.phone ?? '',
          contact: project.contact ?? '',
          price: showPrice && project.price != null ? String(Number(project.price)) : '',
          plannedStart: toDateInputValue(project.plannedStart),
          plannedEnd: toDateInputValue(project.plannedEnd),
          dueDate: toDateInputValue(project.dueDate),
          actualStart: toDateInputValue(project.actualStart),
          actualEnd: toDateInputValue(project.actualEnd),
          managerId: project.managerId ?? '',
          vehicleIds: project.vehicles.map((pv) => pv.vehicleId),
          description: project.description ?? '',
          internalNotes: project.internalNotes ?? '',
          categoryIds: project.workCategories.map((wc) => wc.workCategoryId),
          teamIds: project.team.map((m) => m.employeeId),
          checklistIds: project.checklists
            .map((c) => c.templateId)
            .filter((cid): cid is string => cid !== null),
          deviceIds: project.deviceNeeds.map((pd) => pd.deviceId),
        }}
      />

      <div className={`grid gap-6 ${pairs}`}>
        {/* Tools & materials — no overflow-hidden: the picker dropdown must escape the card */}
        {showPrice && (
          <ProjectAddOns
            projectId={project.id}
            totalLabel={formatCurrency(addOnTotal, locale, { hidden: hidePrices })}
            addOns={project.addOns.map((a) => ({
              id: a.id,
              label: a.label,
              amount: Number(a.amount),
              amountLabel: formatCurrency(Number(a.amount), locale, { hidden: hidePrices }),
              dateLabel: formatDate(a.date, locale),
            }))}
          />
        )}

        {/* The two invoices; marking one ready lets the automation draft the e-mail. */}
        {showPrice && <ProjectInvoices projectId={project.id} rows={invoiceRows} amountField={!hidePrices} />}

        {/* `#material`: the CRM's missing-material lists link straight here. */}
        <section id="material" className="scroll-mt-24 rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">{t('itemsTitle')}</h2>
          </div>
          <ProjectItemsEditor projectId={project.id} items={itemRows} options={catalogOptions} />
        </section>

        {/* Machines this site needs — same shape as the tools/materials list */}
        <section className="rounded-xl border border-border bg-surface shadow-sm">
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
        <section id="checklists" className="scroll-mt-24 rounded-xl border border-border bg-surface shadow-sm">
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

        <div id="defects" className="scroll-mt-24">
          <ProjectDefects
            projectId={project.id}
            defects={defectRows(project.defects, user, todayUtc(), (d) => formatDate(d, locale))}
            assignees={allEmployees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))}
            office
          />
        </div>

        <div id="files" className="scroll-mt-24">
        <FilesCard
          projectId={project.id}
          files={project.documents.map((d) => ({
            id: d.id,
            filename: d.filename,
            mimeType: d.mimeType,
            defect: d.defectId !== null,
            size: d.size,
            source: d.source,
            visibleToCrew: d.visibleToCrew,
            createdAt: d.createdAt,
            uploadedBy: d.uploadedBy,
          }))}
        />
        </div>

        {/* Schedule (read-only here) */}
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
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
    </>
  )

  /**
   * The team talking on the project — office and site manager — beside the
   * work rather than under it. It holds to the top of the window while the
   * cards scroll past, as tall as the window lets it be.
   */
  const talk = (
    <aside
      id="comments"
      className={`min-w-0 scroll-mt-24 ${
        sheet ? 'lg:sticky lg:top-20 lg:max-h-[calc(100vh-8rem)]' : 'xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)]'
      } flex flex-col`}
    >
      <ProjectComments
        projectId={project.id}
        comments={comments}
        people={people}
        add={addProjectComment}
        remove={deleteProjectComment}
        column
      />
    </aside>
  )

  // What a Trello card says under its title: who, which labels, when, how much.
  const faces = [
    ...(project.manager ? [{ id: project.manager.id, name: `${project.manager.firstName} ${project.manager.lastName}`.trim(), manager: true }] : []),
    ...project.team
      .filter((m) => m.employeeId !== project.managerId)
      .map((m) => ({ id: m.employeeId, name: `${m.employee.firstName} ${m.employee.lastName}`.trim(), manager: false })),
  ]
  const planned = [project.plannedStart, project.plannedEnd].filter((d): d is Date => d !== null).map((d) => formatDate(d, locale))
  const tone = dateTone(project.status, project.plannedStart, project.plannedEnd, todayUtc())
  const metaHead = 'text-[11px] font-semibold uppercase tracking-wide text-muted'
  const meta = sheet ? (
    <div className="flex flex-wrap gap-x-8 gap-y-3 px-1">
      <div>
        <p className={metaHead}>{t('sheetMembers')}</p>
        <div className="mt-1 flex min-h-7 items-center -space-x-1">
          {faces.length === 0 ? (
            <span className="text-sm text-muted">—</span>
          ) : (
            faces.map((face) => (
              <span
                key={face.id}
                title={face.manager ? `${t('cardManager')}: ${face.name}` : face.name}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ${
                  face.manager ? 'ring-accent' : 'ring-background'
                } ${PERSON_SWATCH[swatchOf(face.id)]}`}
              >
                {initials(face.name)}
              </span>
            ))
          )}
        </div>
      </div>
      <div>
        <p className={metaHead}>{t('sheetLabels')}</p>
        <div className="mt-1 flex min-h-7 flex-wrap items-center gap-1">
          {project.priority === 'HIGH' && (
            <span className={`h-6 rounded px-2 text-xs font-medium leading-6 ${URGENT_LABEL.pill}`}>{t('priorityHigh')}</span>
          )}
          {project.isSub && <span className={`h-6 rounded px-2 text-xs font-medium leading-6 ${SUB_LABEL.pill}`}>SUB</span>}
          {project.workCategories.map((wc) => (
            <span key={wc.workCategoryId} className={`h-6 rounded px-2 text-xs font-medium leading-6 ${LABEL_PILL[labelSwatch(wc.workCategory.color, wc.workCategoryId)]}`}>
              {categoryLabel(wc.workCategory)}
            </span>
          ))}
          {project.priority !== 'HIGH' && !project.isSub && project.workCategories.length === 0 && (
            <span className="text-sm text-muted">—</span>
          )}
        </div>
      </div>
      <div>
        <p className={metaHead}>{t('sheetDates')}</p>
        <p
          className={`mt-1 inline-flex min-h-7 items-center rounded px-1.5 text-sm tabular-nums ${
            tone === 'late' ? 'bg-danger/10 text-danger' : tone === 'soon' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : ''
          }`}
          title={tone === 'late' ? t('cardLate') : tone === 'soon' ? t('cardSoon') : undefined}
        >
          {planned.length > 0 ? planned.join(' – ') : '—'}
        </p>
      </div>
      {project.dueDate && (
        <div>
          <p className={metaHead}>{t('dueDate')}</p>
          <p
            className={`mt-1 inline-flex min-h-7 items-center gap-1 rounded px-1.5 text-sm tabular-nums ${
              due === 'late' ? 'bg-danger/10 text-danger' : due === 'soon' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : ''
            }`}
            title={due === 'late' ? t('cardDueLate') : due === 'soon' ? t('cardDueSoon') : undefined}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {formatDate(project.dueDate, locale)}
          </p>
        </div>
      )}
      {showPrice && orderTotal != null && (
        <div>
          <p className={metaHead}>{t('price')}</p>
          <p className="mt-1 flex min-h-7 items-center text-sm font-medium tabular-nums">
            {formatCurrency(orderTotal, locale, { hidden: hidePrices })}
          </p>
        </div>
      )}
    </div>
  ) : null

  // Over the board the bar sticks to the sheet it is in, not to the window.
  const Head = sheet ? SheetHead : StickyHead

  return (
    <div className="space-y-6">
      <Head>
        <PageBar
          back={sheet ? undefined : { href: '/projects', label: t('title') }}
          title={
            <>
              <span className="mr-2 text-muted">{project.number}</span>
              {project.name}
            </>
          }
          meta={
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
          }
          actions={
            <>
            <ProjectBarActions
              label={tc('edit')}
              saveLabel={tc('save')}
              cancelLabel={tc('cancel')}
              whileEditing={
                user.role === 'ADMIN' ? (
                  <MergeButton
                    projectId={project.id}
                    projects={otherProjects.map((p) => ({ value: p.id, label: `${p.number} — ${p.name}` }))}
                  />
                ) : null
              }
            >
              {['COMPLETED', 'INVOICED', 'PAID'].includes(project.status) && (
                <ReopenButton projectId={project.id} projectLabel={`${project.number} — ${project.name}`} />
              )}
              <Link href={`/projects/${project.id}/sheet`} className={btn.outlineSm}>
                {tSheet('title')}
              </Link>
              {sheet && (
                <Link href={`/projects/${project.id}`} className={btn.outlineSm}>
                  {t('cardOpenFull')}
                </Link>
              )}
              {user.role === 'ADMIN' && (
                <DeleteButton
                  action={deleteProject.bind(null, project.id)}
                  label={tc('delete')}
                  confirmMessage={t('deleteConfirm')}
                />
              )}
            </ProjectBarActions>
            {/* Over the board the cross closes the sheet — the last button on the right. */}
            {sheet && <SheetClose />}
            </>
          }
        />
      </Head>
      <PageHint>
        <Link href={`/customers/${project.customerId}`} className="text-accent hover:underline">
          {project.customer.name}
        </Link>
        {address && <> · {address}</>}
      </PageHint>
      {meta}

      {/* Over the board the project reads like a Trello card: under the title
          what can be added to it, then what it is made of on the left and the
          talk about it on the right. */}
      {sheet && (
        <SheetAddBar
          labels={{
            heading: t('sheetAddToCard'),
            members: t('sheetMembers'),
            labels: t('sheetLabels'),
            checklist: t('sheetChecklist'),
            dates: t('sheetDates'),
            attachment: t('sheetAttachment'),
            comment: t('sheetComment'),
          }}
        />
      )}
      <div className={`grid items-start gap-6 ${sheet ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : 'xl:grid-cols-[minmax(0,1fr)_22rem]'}`}>
        <div className="min-w-0 space-y-6">{body}</div>
        {talk}
      </div>

    </div>
  )
}
