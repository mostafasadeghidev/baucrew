import { getLocale, getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { LiveSelect } from '@/components/live-search'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { orderValue } from '@/lib/reports'
import { formatCurrency } from '@/lib/format'
import { groupPlanJobs, matchProjectsToJobs, type JobProject, type PlanJob } from '@/lib/plan-jobs'
import { PlanTable, type JobRow } from './plan-table'

export default async function PlanMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const user = await requireManagement()
  const [t, tNav, locale, { year: yearParam }] = await Promise.all([
    getTranslations('planMatch'),
    getTranslations('nav'),
    getLocale(),
    searchParams,
  ])

  if (!canViewFinancials(user)) {
    const tr = await getTranslations('reports')
    return (
      <div className="space-y-4">
        <BackLink href="/reports" label={tNav('reports')} />
        <p className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
          {tr('noAccess')}
        </p>
      </div>
    )
  }

  const currentYear = new Date().getUTCFullYear()
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : currentYear
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'
  const monthFmt = new Intl.DateTimeFormat(intl, { month: 'short', timeZone: 'UTC' })
  const monthLabel = (m: number) => monthFmt.format(new Date(Date.UTC(year, m - 1, 1)))

  const [lines, otherFree, projects, years] = await Promise.all([
    db.planEntry.findMany({
      where: { year, month: { not: null } },
      orderBy: [{ month: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        year: true,
        month: true,
        name: true,
        amount: true,
        isSub: true,
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
    // The other years' free lines take part in matching too: a site that has
    // a job in two years must be offered both, not quietly given this one.
    db.planEntry.findMany({
      where: { year: { not: year }, projectId: null, month: { not: null } },
      select: { id: true, year: true, month: true, name: true, amount: true, isSub: true },
    }),
    db.project.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: {
        id: true,
        number: true,
        name: true,
        sourceCreatedAt: true,
        createdAt: true,
        customer: { select: { name: true } },
        planEntries: { select: { id: true }, take: 1 },
      },
      orderBy: { number: 'desc' },
    }),
    db.planEntry.groupBy({ by: ['year'], orderBy: { year: 'desc' } }),
  ])

  // Lines fold into jobs; a job is linked when its lines point at a project.
  const free = groupPlanJobs(
    lines.filter((l) => !l.project).map((l) => ({ ...l, amount: Number(l.amount) }))
  )
  const linkedByProject = new Map<string, { lines: typeof lines; job: PlanJob }>()
  for (const [pid, group] of Map.groupBy(
    lines.filter((l) => l.project),
    (l) => l.project!.id
  )) {
    const [job] = groupPlanJobs(group.map((l) => ({ ...l, amount: Number(l.amount) })))
    if (job) linkedByProject.set(pid, { lines: group, job })
  }

  // Which free projects could each free job belong to? Run the matcher once,
  // then read it backwards so every job row can offer its candidates.
  const freeProjects: JobProject[] = projects
    .filter((p) => p.planEntries.length === 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      customer: p.customer.name,
      sourceCreatedAt: p.sourceCreatedAt,
      createdAt: p.createdAt,
    }))
  const allFree = [
    ...free,
    ...groupPlanJobs(otherFree.map((l) => ({ ...l, amount: Number(l.amount) }))),
  ]
  const matches = matchProjectsToJobs(freeProjects, allFree)
  const jobId = (j: PlanJob) => `${j.year}|${j.key}`
  const suggestionsFor = new Map<string, Array<{ projectId: string; sure: boolean }>>()
  for (const m of matches) {
    if (m.sure) suggestionsFor.set(jobId(m.sure), [{ projectId: m.projectId, sure: true }])
    for (const c of m.candidates) {
      if (m.sure && jobId(c) === jobId(m.sure)) continue
      const list = suggestionsFor.get(jobId(c)) ?? []
      if (list.length < 3 && !list.some((x) => x.projectId === m.projectId)) {
        list.push({ projectId: m.projectId, sure: false })
        suggestionsFor.set(jobId(c), list)
      }
    }
  }
  const projectLabel = new Map(projects.map((p) => [p.id, `${p.number} — ${p.name}`]))

  const span = (j: PlanJob) =>
    j.months.length === 1
      ? monthLabel(j.months[0])
      : `${monthLabel(j.months[0])}–${monthLabel(j.months[j.months.length - 1])}`

  const rows: JobRow[] = [
    ...free.map((j) => ({
      key: jobId(j),
      lineIds: j.lineIds,
      span: span(j),
      firstMonth: j.months[0],
      name: j.names.join(' / '),
      amount: j.amount,
      isSub: j.isSub,
      months: j.months.length,
      linked: null,
      suggestions: (suggestionsFor.get(jobId(j)) ?? []).map((s) => ({
        projectId: s.projectId,
        label: projectLabel.get(s.projectId) ?? '',
        sure: s.sure,
      })),
    })),
    ...[...linkedByProject.entries()].map(([pid, { lines: group, job }]) => ({
      key: `linked|${pid}`,
      lineIds: group.map((l) => l.id),
      span: span(job),
      firstMonth: job.months[0],
      name: job.names.join(' / '),
      amount: job.amount,
      isSub: job.isSub,
      months: job.months.length,
      linked: {
        id: pid,
        number: group[0].project!.number,
        name: group[0].project!.name,
        orderValue: orderValue(group[0].project!.price, group[0].project!.addOns),
      },
      suggestions: [],
    })),
  ].sort((a, b) => a.firstMonth - b.firstMonth || a.name.localeCompare(b.name))

  const plannedTotal = rows.reduce((s, r) => s + r.amount, 0)
  const openRows = rows.filter((r) => !r.linked)
  const openTotal = openRows.reduce((s, r) => s + r.amount, 0)
  const sureCount = openRows.filter((r) => r.suggestions.some((s) => s.sure)).length
  const money = (v: number) => formatCurrency(v, locale)
  const yearOptions = years.map((y) => ({ value: String(y.year), label: String(y.year) }))

  return (
    <div className="space-y-4">
      <div>
        <BackLink href="/reports?tab=revenue" label={tNav('reports')} />
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
          <p className="text-xs text-muted">{t('kpiJobs', { count: rows.length, lines: lines.length })}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted">{t('kpiLinked')}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{rows.length - openRows.length}</p>
          <p className="text-xs text-muted">{t('kpiOfJobs', { count: rows.length })}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted">{t('kpiOpen')}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {money(openTotal)}
          </p>
          <p className="text-xs text-muted">{t('kpiOpenJobs', { count: openRows.length })}</p>
        </div>
      </div>

      <PlanTable
        year={year}
        rows={rows}
        projects={projects
          .filter((p) => p.planEntries.length === 0)
          .map((p) => ({ value: p.id, label: `${p.number} — ${p.name}` }))}
        sureCount={sureCount}
        linkedCount={rows.length - openRows.length}
      />
    </div>
  )
}
