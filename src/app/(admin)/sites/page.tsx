import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { AlertTriangle, CalendarDays, Camera, CircleCheck, ClipboardList, FileSignature, ListChecks, Users } from 'lucide-react'
import { db } from '@/lib/db'
import { isOffice, requireStaff } from '@/lib/authz'
import { projectScope } from '@/lib/project-scope'
import { addDays, iso, todayUtc } from '@/lib/dates'
import { formatDate } from '@/lib/format'
import { checklistProgress, countDue, siteFlags, SOON_DAYS, sortSites, type SiteFlag, type SiteRow } from '@/lib/sites'
import { LiveSearchInput } from '@/components/live-search'
import { StatusBadge } from '@/components/status-badge'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'
import type { ProjectStatus } from '@/generated/prisma/enums'

/**
 * Baustellen: the sites being built right now and the ones about to start,
 * each with what still hangs on it. A project arrives here by itself the day
 * its status turns to "in progress" — nobody puts it here. The office sees
 * every site; a site manager the ones they are named on.
 */
export default async function SitesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [t, tProjects, locale, user, sp] = await Promise.all([
    getTranslations('sites'),
    getTranslations('projects'),
    getLocale(),
    requireStaff(),
    searchParams,
  ])
  const office = isOffice(user)
  const today = todayUtc()
  const horizon = addDays(today, SOON_DAYS)
  const q = (sp.q ?? '').trim()
  const scope = projectScope(user) ?? {}

  const projects = await db.project.findMany({
    where: {
      AND: [
        scope,
        {
          OR: [
            { status: 'IN_PROGRESS' },
            // About to start: planned, and its first day is within reach.
            { status: { in: ['PLANNED', 'APPROVED'] }, plannedStart: { lte: horizon } },
            { status: { in: ['PLANNED', 'APPROVED'] }, scheduleEntries: { some: { date: { gte: today, lte: horizon }, cancelledAt: null } } },
          ],
        },
        q
          ? {
              OR: [
                { number: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
                { customer: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    },
    select: {
      id: true,
      number: true,
      name: true,
      status: true,
      street: true,
      city: true,
      plannedStart: true,
      plannedEnd: true,
      customer: { select: { name: true } },
      manager: { select: { firstName: true, lastName: true } },
      tasks: { where: { doneAt: null }, select: { dueDate: true } },
      defects: { where: { resolvedAt: null }, select: { dueDate: true } },
      forms: { select: { documentId: true } },
      checklists: { select: { items: { select: { checkedAt: true } } } },
      _count: { select: { team: true, documents: { where: { mimeType: { startsWith: 'image/' } } } } },
    },
  })

  // When the crew is next on each site, and when it last was: two passes over
  // the schedule, one looking forward and one back.
  const ids = projects.map((p) => p.id)
  const [nextDays, lastDays] = await Promise.all([
    db.scheduleEntry.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids }, date: { gte: today }, cancelledAt: null },
      _min: { date: true },
    }),
    db.scheduleEntry.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids }, date: { lt: today }, cancelledAt: null },
      _max: { date: true },
    }),
  ])
  const nextOf = new Map(nextDays.map((g) => [g.projectId, g._min.date]))
  const lastOf = new Map(lastDays.map((g) => [g.projectId, g._max.date]))

  const rows: SiteRow[] = sortSites(
    projects.map((p) => {
      const tasks = countDue(p.tasks, today)
      const defects = countDue(p.defects, today)
      const checklist = checklistProgress(p.checklists)
      const signed = p.forms.filter((f) => f.documentId).length
      return {
        id: p.id,
        number: p.number,
        name: p.name,
        status: p.status,
        customer: p.customer.name,
        place: [p.street, p.city].filter(Boolean).join(', ') || null,
        manager: p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : null,
        crew: p._count.team,
        plannedStart: p.plannedStart,
        plannedEnd: p.plannedEnd,
        nextDate: nextOf.get(p.id) ?? null,
        lastDate: lastOf.get(p.id) ?? null,
        counts: {
          openTasks: tasks.open,
          overdueTasks: tasks.overdue,
          openDefects: defects.open,
          overdueDefects: defects.overdue,
          photos: p._count.documents,
          openForms: p.forms.length - signed,
          signedForms: signed,
          checklistDone: checklist.done,
          checklistTotal: checklist.total,
        },
      }
    })
  )
  const running = rows.filter((r) => r.status === 'IN_PROGRESS')
  const soon = rows.filter((r) => r.status !== 'IN_PROGRESS')

  const flagLabel: Record<SiteFlag, string> = {
    overdueDefects: t('flagOverdueDefects'),
    overdueTasks: t('flagOverdueTasks'),
    openForms: t('flagOpenForms'),
    noCrew: t('flagNoCrew'),
    noAssignment: t('flagNoAssignment'),
  }

  const chip = 'inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-foreground'

  function Site({ row }: { row: SiteRow }) {
    const flags = siteFlags(row)
    const c = row.counts
    const href = `/projects/${row.id}`
    return (
      <li className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <Link href={href} className="truncate font-medium hover:underline">
                <span className="tabular-nums text-muted">{row.number}</span> {row.name}
              </Link>
              <StatusBadge status={row.status as ProjectStatus} />
            </p>
            <p className="mt-1 text-sm text-muted">
              {[row.customer, row.place].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>
                {t('manager')}: <span className="text-foreground">{row.manager ?? '—'}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {t('crew', { n: row.crew })}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {row.nextDate ? (
                  <Link href={`/schedule?week=${iso(row.nextDate)}`} className="hover:underline">
                    {t('nextAssignment', { date: formatDate(row.nextDate, locale) })}
                  </Link>
                ) : row.lastDate ? (
                  t('lastAssignment', { date: formatDate(row.lastDate, locale) })
                ) : row.plannedStart ? (
                  `${tProjects('plannedStart')}: ${formatDate(row.plannedStart, locale)}`
                ) : (
                  t('noAssignment')
                )}
              </span>
            </p>
          </div>
          {flags.length > 0 && (
            <ul className="flex shrink-0 flex-wrap gap-1.5">
              {flags.map((flag) => (
                <li
                  key={flag}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {flagLabel[flag]}
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* What hangs on the site — each count opens that part of the project. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link href={`${href}#tasks`} className={chip}>
            <CircleCheck className="h-3.5 w-3.5" aria-hidden />
            {t('tasks', { n: c.openTasks })}
            {c.overdueTasks > 0 && <span className="text-red-600 dark:text-red-400">({c.overdueTasks})</span>}
          </Link>
          <Link href={`${href}#defects`} className={chip}>
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            {t('defects', { n: c.openDefects })}
            {c.overdueDefects > 0 && <span className="text-red-600 dark:text-red-400">({c.overdueDefects})</span>}
          </Link>
          <Link href={`${href}#forms`} className={chip}>
            <FileSignature className="h-3.5 w-3.5" aria-hidden />
            {c.openForms + c.signedForms === 0 ? t('formsNone') : t('forms', { open: c.openForms, signed: c.signedForms })}
          </Link>
          <Link href={`${href}#checklists`} className={chip}>
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            {c.checklistTotal === 0 ? t('checklistsNone') : t('checklists', { done: c.checklistDone, total: c.checklistTotal })}
          </Link>
          <Link href={`${href}#files`} className={chip}>
            <Camera className="h-3.5 w-3.5" aria-hidden />
            {t('photos', { n: c.photos })}
          </Link>
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar
          title={t('title')}
          meta={
            <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">
              {t('count', { running: running.length, soon: soon.length })}
            </span>
          }
          actions={<LiveSearchInput placeholder={t('search')} />}
        />
      </StickyHead>
      <PageHint>{office ? t('hint') : t('hintSiteManager')}</PageHint>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {q ? t('noneFound') : t('none')}
        </p>
      ) : (
        <>
          {running.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted">{t('running', { n: running.length })}</h2>
              <ul className="space-y-3">
                {running.map((row) => (
                  <Site key={row.id} row={row} />
                ))}
              </ul>
            </section>
          )}
          {soon.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted">{t('soon', { n: soon.length, days: SOON_DAYS })}</h2>
              <ul className="space-y-3">
                {soon.map((row) => (
                  <Site key={row.id} row={row} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
