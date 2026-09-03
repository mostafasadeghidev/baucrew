import { getLocale, getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { LiveSelect } from '@/components/live-search'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { orderValue } from '@/lib/reports'
import { formatCurrency } from '@/lib/format'
import { suggestMatches, type MatchProject } from '@/lib/plan-match'
import { PlanTable, type PlanRow } from './plan-table'

export default async function PlanMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const user = await requireManagement()
  const [t, tReports, locale, { year: yearParam }] = await Promise.all([
    getTranslations('planMatch'),
    getTranslations('nav'),
    getLocale(),
    searchParams,
  ])

  if (!canViewFinancials(user)) {
    const tr = await getTranslations('reports')
    return (
      <div className="space-y-4">
        <BackLink href="/reports" label={tReports('reports')} />
        <p className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
          {tr('noAccess')}
        </p>
      </div>
    )
  }

  const currentYear = new Date().getUTCFullYear()
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : currentYear
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'
  const monthFmt = new Intl.DateTimeFormat(intl, { month: 'long', timeZone: 'UTC' })

  const [entries, projects, takenElsewhere, years] = await Promise.all([
    db.planEntry.findMany({
      where: { year },
      orderBy: [{ month: 'asc' }, { name: 'asc' }],
      include: {
        project: {
          select: {
            id: true,
            number: true,
            name: true,
            price: true,
            addOns: { select: { amount: true } },
          },
        },
      },
    }),
    db.project.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: {
        id: true,
        number: true,
        name: true,
        plannedStart: true,
        customer: { select: { name: true } },
      },
      orderBy: { number: 'desc' },
    }),
    db.planEntry.findMany({
      where: { projectId: { not: null } },
      select: { projectId: true },
    }),
    db.planEntry.groupBy({ by: ['year'], orderBy: { year: 'desc' } }),
  ])

  const candidates: MatchProject[] = projects.map((p) => ({
    id: p.id,
    number: p.number,
    name: p.name,
    customer: p.customer.name,
    month: p.plannedStart ? p.plannedStart.getUTCMonth() : null,
  }))
  const projectLabel = new Map(projects.map((p) => [p.id, `${p.number} — ${p.name}`]))

  const open = entries.filter((e) => e.projectId === null)
  const suggestions = new Map(
    suggestMatches(
      open.map((e) => ({ id: e.id, name: e.name, month: e.month })),
      candidates,
      takenElsewhere.map((t) => t.projectId!)
    ).map((s) => [s.entryId, s])
  )

  const rows: PlanRow[] = entries.map((entry) => {
    const suggestion = suggestions.get(entry.id)
    return {
      id: entry.id,
      monthLabel: entry.month
        ? monthFmt.format(new Date(Date.UTC(year, entry.month - 1, 1)))
        : t('noMonth'),
      name: entry.name,
      amount: Number(entry.amount),
      isSub: entry.isSub,
      linked: entry.project
        ? {
            id: entry.project.id,
            number: entry.project.number,
            name: entry.project.name,
            orderValue: orderValue(entry.project.price, entry.project.addOns),
          }
        : null,
      suggestion:
        suggestion && !entry.projectId
          ? {
              projectId: suggestion.projectId,
              label: projectLabel.get(suggestion.projectId) ?? '',
              score: suggestion.score,
            }
          : null,
    }
  })

  const linkedCount = entries.length - open.length
  const plannedTotal = rows.reduce((sum, r) => sum + r.amount, 0)
  const openTotal = rows.filter((r) => !r.linked).reduce((sum, r) => sum + r.amount, 0)
  const money = (v: number) => formatCurrency(v, locale)

  const yearOptions = years.map((y) => ({ value: String(y.year), label: String(y.year) }))

  return (
    <div className="space-y-4">
      <div>
        <BackLink href="/reports?tab=revenue" label={tReports('reports')} />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('hint')}</p>
          </div>
          {yearOptions.length > 0 && (
            <LiveSelect param="year" options={yearOptions} ariaLabel={t('yearLabel')} />
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted">{t('kpiPlanned')}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{money(plannedTotal)}</p>
          <p className="text-xs text-muted">{t('kpiLines', { count: entries.length })}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted">{t('kpiLinked')}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{linkedCount}</p>
          <p className="text-xs text-muted">{t('kpiOfLines', { count: entries.length })}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted">{t('kpiOpen')}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {money(openTotal)}
          </p>
          <p className="text-xs text-muted">{t('kpiOpenLines', { count: open.length })}</p>
        </div>
      </div>

      <PlanTable
        year={year}
        rows={rows}
        projects={projects.map((p) => ({ value: p.id, label: `${p.number} — ${p.name}` }))}
        suggestionCount={suggestions.size}
        linkedCount={linkedCount}
      />
    </div>
  )
}
