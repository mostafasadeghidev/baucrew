import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { createProject } from '../actions'
import { ProjectForm } from '../project-form'
import { TemplatePicker } from './template-picker'
import { TemplateItemsSection } from './template-items-section'
import { getOptionLists } from '@/lib/option-lists-db'
import { optionLabel } from '@/lib/option-lists'

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; draft?: string }>
}) {
  const user = await requireManagement()
  const { template: templateId, draft: draftId } = await searchParams
  const t = await getTranslations('projects')
  const locale = await getLocale()
  const lists = await getOptionLists()

  const [customers, employees, vehicles, categories, checklists, devices, templates, template] = await Promise.all([
    db.customer.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, street: true, postalCode: true, city: true, phone: true, latitude: true, longitude: true },
    }),
    db.employee.findMany({
      where: { active: true },
      orderBy: { firstName: 'asc' },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.vehicle.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.workCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, nameDe: true, nameEn: true },
    }),
    db.checklistTemplate.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    db.device.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, inventoryNo: true },
    }),
    db.projectTemplate.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    templateId
      ? db.projectTemplate.findUnique({
          where: { id: templateId },
          select: {
            id: true,
            name: true,
            description: true,
            workCategoryId: true,
            managerId: true,
            vehicles: { select: { vehicleId: true } },
            employees: { select: { employeeId: true } },
            checklists: { select: { checklistTemplateId: true } },
            deviceNeeds: { select: { deviceId: true } },
            items: { include: { catalogItem: { select: { id: true, name: true, unit: true } } } },
          },
        })
      : null,
  ])
  // Taking over an inbox draft prefills the form.
  const draft = draftId
    ? await db.projectDraft.findUnique({ where: { id: draftId, status: 'open' } })
    : null
  const draftCustomer = draft?.customerName
    ? await db.customer.findFirst({
        where: { name: { equals: draft.customerName, mode: 'insensitive' } },
        select: { id: true },
      })
    : null
  const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')

  const catalog = await db.catalogItem.findMany({
    where: { active: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, unit: true },
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h1>

      {templates.length > 0 && (
        <TemplatePicker
          templates={templates.map((tp) => ({ value: tp.id, label: tp.name }))}
          current={template?.id ?? ''}
        />
      )}

      <ProjectForm
        key={template?.id ?? 'blank'}
        action={createProject}
        cancelHref="/projects"
        showPrice={canViewFinancials(user)}
        templateId={template?.id}
        draftId={draft?.id}
        extraSection={
          <TemplateItemsSection
            key={template?.id ?? 'blank'}
            initialItems={(template?.items ?? []).map((it) => ({
              catalogItemId: it.catalogItem.id,
              name: it.catalogItem.name,
              unit: it.catalogItem.unit,
              quantity: it.quantity != null ? Number(it.quantity) : null,
            }))}
            options={catalog.map((c) => ({ value: c.id, label: c.unit ? `${c.name} (${c.unit})` : c.name }))}
            fromTemplate={!!template}
          />
        }
        customers={customers.map((c) => ({ value: c.id, label: c.name }))}
        customerAddresses={Object.fromEntries(
          customers.map((c) => [
            c.id,
            { street: c.street ?? '', postalCode: c.postalCode ?? '', city: c.city ?? '', phone: c.phone ?? '', latitude: c.latitude, longitude: c.longitude },
          ])
        )}
        employees={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))}
        vehicles={vehicles.map((v) => ({ value: v.id, label: v.name }))}
        checklists={checklists.map((c) => ({ value: c.id, label: c.name }))}
        devices={devices.map((d) => ({
          value: d.id,
          label: d.inventoryNo ? `${d.name} (${d.inventoryNo})` : d.name,
        }))}
        leadSources={lists.leadSources.map((e) => ({ value: e.value, label: optionLabel(lists.leadSources, e.value, locale) }))}
        clientTypes={lists.clientTypes.map((e) => ({ value: e.value, label: optionLabel(lists.clientTypes, e.value, locale) }))}
        buildingTypes={lists.buildingTypes.map((e) => ({ value: e.value, label: optionLabel(lists.buildingTypes, e.value, locale) }))}
        categories={categories.map((c) => ({
          value: c.id,
          label: locale === 'en' ? c.nameEn : c.nameDe,
        }))}
        initial={{
          name: draft?.name ?? template?.name ?? '',
          customerId: draftCustomer?.id ?? '',
          status: 'LEAD',
          isSub: false,
          clientType: '',
          buildingType: '',
          priority: '',
          leadSource: '',
          street: draft?.street ?? '',
          postalCode: draft?.postalCode ?? '',
          city: draft?.city ?? '',
          latitude: null,
          longitude: null,
          phone: '',
          contact: '',
          price: draft?.price != null ? String(draft.price) : '',
          plannedStart: iso(draft?.plannedStart),
          plannedEnd: iso(draft?.plannedEnd),
          actualStart: '',
          actualEnd: '',
          managerId: template?.managerId ?? '',
          vehicleIds: template?.vehicles.map((tv) => tv.vehicleId) ?? [],
          description: draft?.description ?? template?.description ?? '',
          internalNotes:
            draft?.customerName && !draftCustomer
              ? `Kunde laut Import: ${draft.customerName}`
              : '',
          categoryIds: template?.workCategoryId ? [template.workCategoryId] : [],
          teamIds: template?.employees.map((te) => te.employeeId) ?? [],
          checklistIds: template?.checklists.map((tc) => tc.checklistTemplateId) ?? [],
          deviceIds: template?.deviceNeeds.map((td) => td.deviceId) ?? [],
        }}
      />
    </div>
  )
}
