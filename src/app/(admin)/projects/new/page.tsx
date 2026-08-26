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
  searchParams: Promise<{ template?: string }>
}) {
  const user = await requireManagement()
  const { template: templateId } = await searchParams
  const t = await getTranslations('projects')
  const locale = await getLocale()
  const lists = await getOptionLists()

  const [customers, employees, vehicles, categories, checklists, templates, template] = await Promise.all([
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
            items: { include: { catalogItem: { select: { id: true, name: true, unit: true } } } },
          },
        })
      : null,
  ])
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
        leadSources={lists.leadSources.map((e) => ({ value: e.value, label: optionLabel(lists.leadSources, e.value, locale) }))}
        clientTypes={lists.clientTypes.map((e) => ({ value: e.value, label: optionLabel(lists.clientTypes, e.value, locale) }))}
        buildingTypes={lists.buildingTypes.map((e) => ({ value: e.value, label: optionLabel(lists.buildingTypes, e.value, locale) }))}
        categories={categories.map((c) => ({
          value: c.id,
          label: locale === 'en' ? c.nameEn : c.nameDe,
        }))}
        initial={{
          name: template?.name ?? '',
          customerId: '',
          status: 'LEAD',
          isSub: false,
          clientType: '',
          buildingType: '',
          priority: '',
          leadSource: '',
          street: '',
          postalCode: '',
          city: '',
          latitude: null,
          longitude: null,
          phone: '',
          contact: '',
          price: '',
          plannedStart: '',
          plannedEnd: '',
          actualStart: '',
          actualEnd: '',
          managerId: template?.managerId ?? '',
          vehicleIds: template?.vehicles.map((tv) => tv.vehicleId) ?? [],
          description: template?.description ?? '',
          internalNotes: '',
          categoryIds: template?.workCategoryId ? [template.workCategoryId] : [],
          teamIds: template?.employees.map((te) => te.employeeId) ?? [],
          checklistIds: template?.checklists.map((tc) => tc.checklistTemplateId) ?? [],
        }}
      />
    </div>
  )
}
