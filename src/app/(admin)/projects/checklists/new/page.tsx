import { getTranslations } from 'next-intl/server'
import { requireManagement } from '@/lib/authz'
import { ChecklistForm } from '../checklist-form'
import { createChecklist } from '../actions'
import { PageBar, StickyHead } from '@/components/ui/page-panel'

export default async function NewChecklistPage() {
  await requireManagement()
  const t = await getTranslations('checklists')

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar
          back={{ href: '/projects/checklists', label: t('templatesTitle') }}
          title={t('templateAdd')}
        />
      </StickyHead>
      <ChecklistForm
        action={createChecklist}
        initial={{ name: '', description: '', active: true, items: [] }}
      />
    </div>
  )
}
