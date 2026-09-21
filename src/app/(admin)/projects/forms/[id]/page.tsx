import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { parseFields, parseSigners } from '@/lib/forms'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'
import { FormTemplateForm } from '../template-form'
import { deleteFormTemplate, updateFormTemplate } from '../actions'

export default async function EditFormTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireManagement()
  const { id } = await params
  const t = await getTranslations('forms')
  const template = await db.formTemplate.findUnique({ where: { id } })
  if (!template) notFound()

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar back={{ href: '/projects/forms', label: t('templatesTitle') }} title={template.name} />
      </StickyHead>
      <PageHint>{t('templateEditHint')}</PageHint>
      <FormTemplateForm
        action={updateFormTemplate.bind(null, template.id)}
        deleteAction={deleteFormTemplate.bind(null, template.id)}
        initial={{
          name: template.name,
          description: template.description ?? '',
          active: template.active,
          fields: parseFields(template.fields),
          signers: parseSigners(template.signers),
        }}
      />
    </div>
  )
}
