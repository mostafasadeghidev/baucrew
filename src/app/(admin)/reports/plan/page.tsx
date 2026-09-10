import { getLocale, getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { LiveSelect } from '@/components/live-search'
import { pageTitle, pageToolbar, StickyHead } from '@/components/ui/page-panel'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { orderValue } from '@/lib/reports'
import { formatCurrency } from '@/lib/format'
import {
  groupPlanJobs,
  matchProjectsToJobs,
  mergeJobs,
  type JobProject,
  type PlanJob,
  type PlanLine,
} from '@/lib/plan-jobs'
import { PlanTable, type JobRow } from './plan-table'

/** Statuses that mean the work is behind us. */
const DONE = new Set(['COMPLETED', 'INVOICED', 'PAID'])

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
  const monthYearFmt = new Intl.DateTimeFormat(intl, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const monthLabel = (y: number, m: number) => monthFmt.format(new Date(Date.UTC(y, m - 1, 1)))
  const monthYear = (y: number, m: number) => monthYearFmt.format(new Date(Date.UTC(y, m - 1, 1)))

  // Every year's lines: a job that runs over New Year is one job, and a site
  // with a job in two years must be offered both, not quietly given this one.
  const [allLines, projects, years] = await Promise.all([
    db.planEntry.findMany({
      where: { month: { not: null } },
      orderBy: [{ year: 'asc' }, { month: 'asc' }, { name: 'asc' }],
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
    db.project.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: {
        id: true,
        number: true,
        name: true,
        status: true,
        sourceCreatedAt: true,
        createdAt: true,
        customer: { select: { name: true } },
        planEntries: {
          where: { month: { not: null } },
          select: { id: true, year: true, month: true, name: true, amount: true, isSub: true },
        },
      },
      orderBy: { number: 'desc' },
    }),
    db.planEntry.groupBy({ by: ['year'], orderBy: { year: 'desc' } }),
  ])

  const lines = allLines.filter((l) => l.year === year)
  const asLine = (l: {
    id: string
    year: number
    month: number | null
    name: string
    amount: number | { toString(): string }
    isSub: boolean
  }): PlanLine => ({
    id: l.id,
    year: l.year,
    month: l.month,
    name: l.name,
    amount: Number(l.amount),
    isSub: l.isSub,
  })

  // Lines fold into jobs; this year's page shows the jobs that touch it.
  const freeAll = groupPlanJobs(allLines.filter((l) => !l.project).map(asLine))
  const free = freeAll.filter((j) => j.year <= year && year <= j.endYear)

  // A linked project's lines, whatever year they sit in, shown as one job.
  const linkedByProject = new Map<string, { lines: typeof allLines; job: PlanJob }>()
  for (const [pid, group] of Map.groupBy(
    allLines.filter((l) => l.project),
    (l) => l.project!.id
  )) {
    if (!group.some((l) => l.year === year)) continue
    const jobs = groupPlanJobs(group.map(asLine))
    if (jobs.length) linkedByProject.set(pid, { lines: group, job: mergeJobs(jobs) })
  }

  // Which free projects could each free job belong to? Run the matcher once,
  // then read it backwards so every job row can offer its candidates.
  // Every project takes part: one tied to lines already claims nothing new,
  // but it takes the phase next to what it has and keeps a namesake off it.
  const matchable: JobProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    customer: p.customer.name,
    sourceCreatedAt: p.sourceCreatedAt,
    createdAt: p.createdAt,
    done: DONE.has(p.status),
    linked: p.planEntries.length ? groupPlanJobs(p.planEntries.map(asLine)) : undefined,
  }))
  const matches = matchProjectsToJobs(matchable, freeAll)
  const jobId = (j: PlanJob) => `${j.year}|${j.key}`
  const suggestionsFor = new Map<string, Array<{ projectId: string; sure: boolean }>>()
  for (const m of matches) {
    for (const s of m.sure) suggestionsFor.set(jobId(s), [{ projectId: m.projectId, sure: true }])
    for (const c of m.candidates) {
      if (m.sure.includes(c)) continue
      const list = suggestionsFor.get(jobId(c)) ?? []
      if (list.length < 3 && !list.some((x) => x.projectId === m.projectId)) {
        list.push({ projectId: m.projectId, sure: false })
        suggestionsFor.set(jobId(c), list)
      }
    }
  }
  const projectLabel = new Map(projects.map((p) => [p.id, `${p.number} — ${p.name}`]))

  // "Mär", "Mär–Mai", or "Nov 2025–Feb 2026" when the job runs over New Year.
  const span = (j: PlanJob) => {
    const first = j.months[0]
    const last = j.months[j.months.length - 1]
    if (j.year !== j.endYear) return `${monthYear(j.year, first)}–${monthYear(j.endYear, last)}`
    return first === last ? monthLabel(j.year, first) : `${monthLabel(j.year, first)}–${monthLabel(j.year, last)}`
  }
  // Where the job sits in this year's list: at the top when it came over from last year.
  const firstMonthIn = (j: PlanJob) => (j.year < year ? 1 : j.months[0])

  const rows: JobRow[] = [
    ...free.map((j) => ({
      key: jobId(j),
      lineIds: j.lineIds,
      span: span(j),
      firstMonth: firstMonthIn(j),
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
      firstMonth: firstMonthIn(job),
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

  // The figures are this year's alone; a row may show a job that runs beyond it.
  const plannedTotal = lines.reduce((s, l) => s + Number(l.amount), 0)
  const openRows = rows.filter((r) => !r.linked)
  const openTotal = lines.filter((l) => !l.project).reduce((s, l) => s + Number(l.amount), 0)
  const sureCount = openRows.filter((r) => r.suggestions.some((s) => s.sure)).length
  const money = (v: number) => formatCurrency(v, locale)
  const yearOptions = years.map((y) => ({ value: String(y.year), label: String(y.year) }))

  return (
    <div className="space-y-4">
      <div>
        <BackLink href="/reports?tab=revenue" label={tNav('reports')} />
        <StickyHead>
          <div className={pageToolbar}>
            <div>
              <h1 className={pageTitle}>{t('title')}</h1>
              <p className="mt-1 text-sm text-muted">{t('hint')}</p>
            </div>
            {yearOptions.length > 0 && (
              <LiveSelect param="year" options={yearOptions} ariaLabel={t('yearLabel')} />
            )}
          </div>
        </StickyHead>
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
        // Any project may take another line: a job done in phases has several.
        projects={projects.map((p) => ({ value: p.id, label: `${p.number} — ${p.name}` }))}
        sureCount={sureCount}
        linkedCount={rows.length - openRows.length}
      />
    </div>
  )
}
