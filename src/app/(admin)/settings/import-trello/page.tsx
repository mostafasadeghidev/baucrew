import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/authz'
import { ImportWizard } from './import-wizard'
import { PageBar, StickyHead } from '@/components/ui/page-panel'

export default async function ImportTrelloPage() {
  await requireAdmin()
  const [t, tNav] = await Promise.all([getTranslations('importTrello'), getTranslations('nav')])

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar back={{ href: '/settings?tab=data', label: tNav('settings') }} title={t('title')} />
      </StickyHead>
      <ImportWizard />
    </div>
  )
}
