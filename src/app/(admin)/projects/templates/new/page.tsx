import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { createTemplate } from '../actions'
import { TemplateForm } from '../template-form'
import { TemplateItemsSection } from '../../new/template-items-section'

export default async function NewTemplatePage() {
  await requireManagement()
  const t = await getTranslations('templates')
  const locale = await getLocale()

  const [categories, catalog] = await Promise.all([
    db.workCategory.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    db.catalogItem.findMany({
      where: { active: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, unit: true },
    }),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h1>
      <TemplateForm
        action={createTemplate}
        categories={categories.map((c) => ({
          value: c.id,
          label: locale === 'en' ? c.nameEn : c.nameDe,
        }))}
        initial={{ name: '', workCategoryId: '', description: '', active: true }}
        itemsSection={
          // Tools/materials can be picked before the first save; they are stored
          // together with the template.
          <TemplateItemsSection
            initialItems={[]}
            options={catalog.map((c) => ({ value: c.id, label: c.unit ? `${c.name} (${c.unit})` : c.name }))}
            fromTemplate
            defaultOpen
          />
        }
      />
    </div>
  )
}
