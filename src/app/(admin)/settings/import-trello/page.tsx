import Link from 'next/link'
import { BackLink } from '@/components/back-link'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/authz'
import { ImportWizard } from './import-wizard'

export default async function ImportTrelloPage() {
  await requireAdmin()
  const [t, tNav] = await Promise.all([getTranslations('importTrello'), getTranslations('nav')])

  return (
    <div className="space-y-4">
      <div>
        <BackLink href="/settings" label={tNav('settings')} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      </div>
      <ImportWizard />
    </div>
  )
}
