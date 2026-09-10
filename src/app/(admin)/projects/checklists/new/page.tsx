import { getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { requireManagement } from '@/lib/authz'
import { ChecklistForm } from '../checklist-form'
import { createChecklist } from '../actions'
import { pageTitle, pageToolbar, StickyHead } from '@/components/ui/page-panel'

export default async function NewChecklistPage() {
  await requireManagement()
  const t = await getTranslations('checklists')

  return (
    <div className="space-y-4">
      <StickyHead>
        <div className={pageToolbar}>
          <div>
            <BackLink href="/projects/checklists" label={t('templatesTitle')} />
            <h1 className={`mt-1 ${pageTitle}`}>{t('templateAdd')}</h1>
          </div>
        </div>
      </StickyHead>
      <ChecklistForm
        action={createChecklist}
        initial={{ name: '', description: '', active: true, items: [] }}
      />
    </div>
  )
}
