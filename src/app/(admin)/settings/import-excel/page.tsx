import { getTranslations } from 'next-intl/server'
import { requireManagement } from '@/lib/authz'
import { ImportWizard } from './import-wizard'
import { getImportProfiles } from './actions'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'

export default async function ImportPage() {
  await requireManagement()
  const [t, tNav] = await Promise.all([getTranslations('importExcel'), getTranslations('nav')])
  const profiles = await getImportProfiles()

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar back={{ href: '/settings?tab=data', label: tNav('settings') }} title={t('title')} />
      </StickyHead>
      <PageHint>{t('hint')}</PageHint>
      <ImportWizard profiles={profiles} />
    </div>
  )
}
