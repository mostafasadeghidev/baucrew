import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { DeleteButton } from '@/components/delete-button'
import { deleteTemplate } from '../actions'
import { TemplateEditor } from './template-editor'
import { PageBar, StickyHead } from '@/components/ui/page-panel'

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireManagement()
  const { id } = await params
  const [t, tc] = await Promise.all([getTranslations('templates'), getTranslations('common')])

  const template = await db.projectTemplate.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!template) notFound()

  return (
    <div className="space-y-6">
      <StickyHead>
        <PageBar
          back={{ href: '/projects/templates', label: t('title') }}
          title={
            <>
              {t('editTitle')} — {template.name}
            </>
          }
          actions={
            <DeleteButton
              action={deleteTemplate.bind(null, template.id, null)}
              label={tc('delete')}
              confirmMessage={t('deleteConfirm')}
            />
          }
        />
      </StickyHead>

      <TemplateEditor id={template.id} cancelHref="/projects/templates" />
    </div>
  )
}
