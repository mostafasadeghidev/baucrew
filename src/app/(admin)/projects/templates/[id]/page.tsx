import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { DeleteButton } from '@/components/delete-button'
import { deleteTemplate, updateTemplate } from '../actions'
import { TemplateForm } from '../template-form'
import { TemplateItemsEditor, type TemplateItemRow } from './template-items'
import { BackLink } from '@/components/back-link'

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireManagement()
  const { id } = await params
  const [t, tc, locale] = await Promise.all([
    getTranslations('templates'),
    getTranslations('common'),
    getLocale(),
  ])

  const [template, categories, catalog, employees, vehicles, checklists] = await Promise.all([
    db.projectTemplate.findUnique({
      where: { id },
      include: {
        items: {
          include: { catalogItem: { select: { name: true, unit: true } } },
          orderBy: { catalogItem: { name: 'asc' } },
        },
        vehicles: { select: { vehicleId: true } },
        employees: { select: { employeeId: true } },
        checklists: { select: { checklistTemplateId: true } },
      },
    }),
    db.workCategory.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    db.catalogItem.findMany({
      where: { active: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, unit: true },
    }),
    db.employee.findMany({
      where: { active: true },
      orderBy: { firstName: 'asc' },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.vehicle.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.checklistTemplate.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ])
  if (!template) notFound()

  const assignedIds = new Set(template.items.map((i) => i.catalogItemId))
  const itemRows: TemplateItemRow[] = template.items.map((item) => ({
    id: item.id,
    name: item.catalogItem.name,
    unit: item.catalogItem.unit,
    quantity: item.quantity != null ? Number(item.quantity) : null,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackLink href="/projects/templates" label={t('title')} />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('editTitle')} — {template.name}
          </h1>
        </div>
        <DeleteButton
          action={deleteTemplate.bind(null, template.id)}
          label={tc('delete')}
          confirmMessage={t('deleteConfirm')}
        />
      </div>

      <TemplateForm
        action={updateTemplate.bind(null, template.id)}
        categories={categories.map((c) => ({
          value: c.id,
          label: locale === 'en' ? c.nameEn : c.nameDe,
        }))}
        employees={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))}
        vehicles={vehicles.map((v) => ({ value: v.id, label: v.name }))}
        checklists={checklists.map((c) => ({ value: c.id, label: c.name }))}
        initial={{
          name: template.name,
          workCategoryId: template.workCategoryId ?? '',
          description: template.description ?? '',
          active: template.active,
          managerId: template.managerId ?? '',
          vehicleIds: template.vehicles.map((tv) => tv.vehicleId),
          employeeIds: template.employees.map((te) => te.employeeId),
          checklistIds: template.checklists.map((tc) => tc.checklistTemplateId),
        }}
        itemsSection={
          // Same order as on the create page: the item list sits above the
          // Save / Cancel buttons.
          <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">{t('itemsTitle')}</h2>
            <TemplateItemsEditor
              templateId={template.id}
              items={itemRows}
              options={catalog
                .filter((c) => !assignedIds.has(c.id))
                .map((c) => ({ value: c.id, label: c.unit ? `${c.name} (${c.unit})` : c.name }))}
            />
          </section>
        }
      />
    </div>
  )
}
