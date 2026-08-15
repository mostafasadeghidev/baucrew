import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/authz'
import { ImportWizard } from './import-wizard'

export default async function ImportTrelloPage() {
  await requireAdmin()
  const [t, tNav] = await Promise.all([getTranslations('importTrello'), getTranslations('nav')])

  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings" className="text-sm text-muted hover:text-foreground">
          ← {tNav('settings')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      </div>
      <ImportWizard />
    </div>
  )
}
