import { getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { requireManagement } from '@/lib/authz'
import { ImportWizard } from './import-wizard'
import { getImportProfiles } from './actions'

export default async function ImportPage() {
  await requireManagement()
  const [t, tProjects] = await Promise.all([
    getTranslations('importExcel'),
    getTranslations('projects'),
  ])
  const profiles = await getImportProfiles()

  return (
    <div className="space-y-4">
      <div>
        <BackLink href="/projects" label={tProjects('title')} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('hint')}</p>
      </div>
      <ImportWizard profiles={profiles} />
    </div>
  )
}
