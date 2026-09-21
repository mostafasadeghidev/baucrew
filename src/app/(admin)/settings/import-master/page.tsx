import { getTranslations } from 'next-intl/server'
import { requireManagement } from '@/lib/authz'
import { isMasterKind } from '@/lib/import-master'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'
import { MasterImportWizard } from './master-import-wizard'

/** Customers, employees and vehicles from a spreadsheet. */
export default async function ImportMasterPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireManagement()
  const [t, tNav, { kind }] = await Promise.all([getTranslations('importMaster'), getTranslations('nav'), searchParams])

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar back={{ href: '/settings?tab=data', label: tNav('settings') }} title={t('title')} />
      </StickyHead>
      <PageHint>{t('hint')}</PageHint>
      <MasterImportWizard initialKind={isMasterKind(kind) ? kind : 'customers'} />
    </div>
  )
}
