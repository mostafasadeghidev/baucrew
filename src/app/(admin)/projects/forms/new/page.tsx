import { getTranslations } from 'next-intl/server'
import { requireManagement } from '@/lib/authz'
import { PageBar, StickyHead } from '@/components/ui/page-panel'
import { FormTemplateForm } from '../template-form'
import { createFormTemplate } from '../actions'

export default async function NewFormTemplatePage() {
  await requireManagement()
  const t = await getTranslations('forms')
  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar back={{ href: '/projects/forms', label: t('templatesTitle') }} title={t('templateAdd')} />
      </StickyHead>
      <FormTemplateForm action={createFormTemplate} initial={{ name: '', description: '', active: true, fields: [], signers: [] }} />
    </div>
  )
}
