import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { createTemplate } from '../actions'
import { TemplateForm } from '../template-form'

export default async function NewTemplatePage() {
  await requireManagement()
  const t = await getTranslations('templates')
  const locale = await getLocale()

  const categories = await db.workCategory.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  })

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
      />
    </div>
  )
}
