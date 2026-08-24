import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { createTemplate } from '../actions'
import { TemplateForm } from '../template-form'
import { BackLink } from '@/components/back-link'
import { TemplateItemsSection } from '../../new/template-items-section'

export default async function NewTemplatePage() {
  await requireManagement()
  const t = await getTranslations('templates')
  const locale = await getLocale()

  const [categories, catalog, employees, vehicles, checklists] = await Promise.all([
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

  return (
    <div className="space-y-4">
      <div>
        <BackLink href="/projects/templates" label={t('title')} />
        <h1 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h1>
      </div>
      <TemplateForm
        action={createTemplate}
        categories={categories.map((c) => ({
          value: c.id,
          label: locale === 'en' ? c.nameEn : c.nameDe,
        }))}
        employees={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))}
        vehicles={vehicles.map((v) => ({ value: v.id, label: v.name }))}
        checklists={checklists.map((c) => ({ value: c.id, label: c.name }))}
        initial={{
          name: '',
          workCategoryId: '',
          description: '',
          active: true,
          managerId: '',
          vehicleIds: [],
          employeeIds: [],
          checklistIds: [],
        }}
        itemsSection={
          // Tools/materials can be picked before the first save; they are stored
          // together with the template.
          <TemplateItemsSection
            initialItems={[]}
            options={catalog.map((c) => ({ value: c.id, label: c.unit ? `${c.name} (${c.unit})` : c.name }))}
            fromTemplate
            defaultOpen
            formId="template-form"
          />
        }
      />
    </div>
  )
}
