import { BackLink } from '@/components/back-link'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/authz'
import { ImportWizard } from './import-wizard'
import { pageTitle, pageToolbar, StickyHead } from '@/components/ui/page-panel'

export default async function ImportTrelloPage() {
  await requireAdmin()
  const [t, tNav] = await Promise.all([getTranslations('importTrello'), getTranslations('nav')])

  return (
    <div className="space-y-4">
      <StickyHead>
        <div className={pageToolbar}>
          <div>
            <BackLink href="/settings?tab=data" label={tNav('settings')} />
            <h1 className={`mt-1 ${pageTitle}`}>{t('title')}</h1>
          </div>
        </div>
      </StickyHead>
      <ImportWizard />
    </div>
  )
}
