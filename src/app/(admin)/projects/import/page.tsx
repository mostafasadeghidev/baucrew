import { getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { requireManagement } from '@/lib/authz'
import { ImportWizard } from './import-wizard'
import { getImportProfiles } from './actions'
import { pageTitle, pageToolbar, StickyHead } from '@/components/ui/page-panel'

export default async function ImportPage() {
  await requireManagement()
  const [t, tProjects] = await Promise.all([
    getTranslations('importExcel'),
    getTranslations('projects'),
  ])
  const profiles = await getImportProfiles()

  return (
    <div className="space-y-4">
      <StickyHead>
        <div className={pageToolbar}>
          <div>
            <BackLink href="/projects" label={tProjects('title')} />
            <h1 className={`mt-1 ${pageTitle}`}>{t('title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('hint')}</p>
          </div>
        </div>
      </StickyHead>
      <ImportWizard profiles={profiles} />
    </div>
  )
}
