import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { updateTemplate } from '../actions'
import { TemplateForm } from '../template-form'
import { TemplateItemsEditor, type TemplateItemRow } from './template-items'

/**
 * A template's form with its tools and materials — the same on the template's
 * own page and on its sheet over the board, where "Vorlagen bearbeiten" in the
 * card templates opens it. Nothing when the template is gone.
 */
export async function TemplateEditor({ id, cancelHref }: { id: string; cancelHref: string }) {
  const [t, locale] = await Promise.all([getTranslations('templates'), getLocale()])

  const [template, categories, catalog, employees, vehicles, checklists, devices] = await Promise.all([
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
        deviceNeeds: { select: { deviceId: true } },
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
    db.device.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, inventoryNo: true },
    }),
  ])
  if (!template) return null

  const assignedIds = new Set(template.items.map((i) => i.catalogItemId))
  const itemRows: TemplateItemRow[] = template.items.map((item) => ({
    id: item.id,
    name: item.catalogItem.name,
    unit: item.catalogItem.unit,
    quantity: item.quantity != null ? Number(item.quantity) : null,
  }))

  return (
    <TemplateForm
      action={updateTemplate.bind(null, template.id)}
      cancelHref={cancelHref}
      categories={categories.map((c) => ({
        value: c.id,
        label: locale === 'en' ? c.nameEn : c.nameDe,
      }))}
      employees={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))}
      vehicles={vehicles.map((v) => ({ value: v.id, label: v.name }))}
      checklists={checklists.map((c) => ({ value: c.id, label: c.name }))}
      devices={devices.map((d) => ({
        value: d.id,
        label: d.inventoryNo ? `${d.name} (${d.inventoryNo})` : d.name,
      }))}
      initial={{
        name: template.name,
        workCategoryId: template.workCategoryId ?? '',
        description: template.description ?? '',
        active: template.active,
        managerId: template.managerId ?? '',
        vehicleIds: template.vehicles.map((tv) => tv.vehicleId),
        employeeIds: template.employees.map((te) => te.employeeId),
        checklistIds: template.checklists.map((tc) => tc.checklistTemplateId),
        deviceIds: template.deviceNeeds.map((td) => td.deviceId),
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
  )
}
