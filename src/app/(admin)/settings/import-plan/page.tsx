import { getLocale, getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { DeleteButton } from '@/components/delete-button'
import { requireAdmin } from '@/lib/authz'
import { getPlanYears } from '@/lib/reports'
import { formatCurrency } from '@/lib/format'
import { db } from '@/lib/db'
import { ImportWizard } from './import-wizard'
import { clearPlanYear } from './actions'

export default async function ImportPlanPage() {
  await requireAdmin()
  const [t, tc, tNav, locale, years] = await Promise.all([
    getTranslations('importPlan'),
    getTranslations('common'),
    getTranslations('nav'),
    getLocale(),
    getPlanYears(),
  ])

  const sums = years.length
    ? await db.planEntry.groupBy({
        by: ['year'],
        _sum: { amount: true },
      })
    : []
  const totalByYear = new Map(sums.map((s) => [s.year, Number(s._sum.amount ?? 0)]))

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/settings?tab=data" label={tNav('settings')} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('hint')}</p>
      </div>

      {years.length > 0 && (
        <section className="max-w-3xl overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
            {t('storedTitle')}
          </h2>
          <ul className="divide-y divide-border">
            {years.map((y) => (
              <li key={y.year} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium tabular-nums">{y.year}</span>
                <span className="text-muted">{t('storedEntries', { count: y.entries })}</span>
                <span className="ml-auto font-semibold tabular-nums">
                  {formatCurrency(totalByYear.get(y.year) ?? 0, locale)}
                </span>
                <DeleteButton
                  action={clearPlanYear.bind(null, y.year)}
                  label={tc('delete')}
                  confirmMessage={t('confirmClear', { year: y.year })}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ImportWizard />
    </div>
  )
}
