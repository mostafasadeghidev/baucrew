import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { StatusBadge, STATUS_STYLES } from '@/components/status-badge'
import { PagePanel, pageTitle, pageToolbar, StickyHead } from '@/components/ui/page-panel'
import { LiveSearchInput } from '@/components/live-search'
import { StatusTabs } from '@/components/status-tabs'
import { getPrepTabConfig } from '@/lib/prep-tab-db'
import { getBoardConfig } from '@/lib/board-columns-db'
import type { Prisma } from '@/generated/prisma/client'
import { Pagination } from '@/components/pagination'
import { PAGE_SIZE, parsePage } from '@/lib/pagination'
import { formatCurrency, formatDate } from '@/lib/format'
import { ProjectStatus } from '@/generated/prisma/enums'
import { btn } from '@/components/ui/button'
import { ProjectsKanban, type KanbanColumn } from './kanban'

const STATUSES = Object.keys(ProjectStatus) as ProjectStatus[]

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; view?: string }>
}) {
  const user = await requireManagement()
  const { q, status, page: pageParam, view } = await searchParams
  const page = parsePage(pageParam)
  const [t, tStatus, tTemplates, tChecklists, tDrafts, tc, locale] = await Promise.all([
    getTranslations('projects'),
    getTranslations('status'),
    getTranslations('templates'),
    getTranslations('checklists'),
    getTranslations('drafts'),
    getTranslations('common'),
    getLocale(),
  ])

  const [prepTab, board] = await Promise.all([getPrepTabConfig(), getBoardConfig()])
  const query = q?.trim() ?? ''
  const statusFilter = STATUSES.includes(status as ProjectStatus)
    ? (status as ProjectStatus)
    : undefined
  // "prep" = configurable combined tab (Settings → Projektliste), default
  // LEAD / QUOTED / APPROVED = "Zur Vorbereitung".
  const prepFilter = prepTab.enabled && status === 'prep'
  const showPrice = canViewFinancials(user)
  const prepWhere: Prisma.ProjectWhereInput = {
    status: { in: prepTab.statuses as ProjectStatus[] },
    ...(prepTab.unscheduledOnly ? { scheduleEntries: { none: { cancelledAt: null } } } : {}),
  }

  const statusWhere: Prisma.ProjectWhereInput = statusFilter ? { status: statusFilter } : prepFilter ? prepWhere : {}
  const where: Prisma.ProjectWhereInput = {
    ...statusWhere,
    ...(query
      ? {
          OR: [
            { number: { contains: query, mode: 'insensitive' as const } },
            { name: { contains: query, mode: 'insensitive' as const } },
            { city: { contains: query, mode: 'insensitive' as const } },
            { street: { contains: query, mode: 'insensitive' as const } },
            { customer: { name: { contains: query, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  // Tab counts respect the search query but not the status filter itself.
  const { status: _ignored, scheduleEntries: _ignoredEntries, ...whereWithoutStatus } = where
  const [projects, total, statusCounts, draftCount, prepCount] = await Promise.all([
    db.project.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        // Progress of the site checklists, shown as a small badge.
        checklists: { select: { items: { select: { ok: true } } } },
      },
      orderBy: { number: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.project.count({ where }),
    db.project.groupBy({ by: ['status'], where: whereWithoutStatus, _count: { _all: true } }),
    db.projectDraft.count({ where: { status: 'open' } }),
    prepTab.enabled ? db.project.count({ where: { ...whereWithoutStatus, ...prepWhere } }) : Promise.resolve(0),
  ])
  const countByStatus = new Map(statusCounts.map((s) => [s.status, s._count._all]))
  /**
   * The board reads the same search as the list, but never its status filter:
   * a board with one column is a list with extra steps. It takes the newest
   * fifty of each column — a column of two hundred cards is scrolled past, not
   * read, and the count in its head still says how many there are.
   */
  const kanban = view === 'kanban'
  const COLUMN_CARDS = 50
  const boardProjects = kanban
    ? await db.project.findMany({
        where: whereWithoutStatus,
        select: {
          id: true,
          number: true,
          name: true,
          city: true,
          status: true,
          price: true,
          priority: true,
          plannedStart: true,
          customer: { select: { name: true } },
        },
        orderBy: { number: 'desc' },
      })
    : []
  // Which statuses get a column is the office's own choice (Einstellungen →
  // Arbeitsbereiche), the same way the combined tab on the list is.
  const columns: KanbanColumn[] = board.statuses.map((value) => {
    const own = boardProjects.filter((p) => p.status === value)
    const sum = own.reduce((total, p) => total + (p.price ? Number(p.price) : 0), 0)
    return {
      status: value,
      label: tStatus(value),
      count: own.length,
      sum: showPrice && sum > 0 ? formatCurrency(sum, locale) : null,
      moreLabel:
        own.length > COLUMN_CARDS ? t('kanbanMore', { count: own.length - COLUMN_CARDS }) : null,
      badgeClass: STATUS_STYLES[value],
      cards: own.slice(0, COLUMN_CARDS).map((p) => ({
        id: p.id,
        number: p.number,
        name: p.name,
        customer: p.customer.name,
        city: p.city,
        start: p.plannedStart ? formatDate(p.plannedStart, locale) : null,
        price: showPrice ? formatCurrency(p.price ? Number(p.price) : null, locale) : null,
        urgent: p.priority === 'HIGH',
        status: p.status,
      })),
    }
  })
  const allCount = statusCounts.reduce((sum, s) => sum + s._count._all, 0)

  return (
    <div className="space-y-4">
      <StickyHead>
        <div className={pageToolbar}>
          <h1 className={pageTitle}>{t('title')}</h1>
          <div className="flex items-center gap-2">
            <Link href="/projects/import" className={btn.outline}>
              {tDrafts('toImport')}
            </Link>
            {draftCount > 0 && (
              <Link href="/projects/drafts" className={`${btn.outline} gap-1.5`}>
                {tDrafts('title')}
                <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground">
                  {draftCount}
                </span>
              </Link>
            )}
            <Link
              href="/projects/checklists"
              className={btn.outline}
            >
              {tChecklists('templatesTitle')}
            </Link>
            <Link
              href="/projects/templates"
              className={btn.outline}
            >
              {tTemplates('title')}
            </Link>
            <Link
              href="/projects/new"
              className={btn.primary}
            >
              {t('newProject')}
            </Link>
          </div>
        </div>
      </StickyHead>

      <PagePanel>
        <div className="space-y-3 border-b border-border p-4">
          {!kanban && (
          <StatusTabs
            allLabel={t('allStatuses')}
            allCount={allCount}
            tabs={[
              ...(prepTab.enabled
                ? [{ value: 'prep', label: prepTab.label || t('tabPreparation'), count: prepCount }]
                : []),
              ...STATUSES.filter((s) => (countByStatus.get(s) ?? 0) > 0 || s === statusFilter).map(
                (s) => ({
                  value: s,
                  label: tStatus(s),
                  count: countByStatus.get(s) ?? 0,
                })
              ),
            ]}
          />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex max-w-md flex-1">
              <LiveSearchInput placeholder={t('searchPlaceholder')} />
            </div>
            {/* List or board — the same projects, the same search, two ways of
                looking at them. It sits with the search rather than up with the
                buttons: it changes what you are looking at, not what you do. */}
            <div className="ml-auto flex items-center gap-1 rounded-lg bg-subtle p-1 text-sm font-medium">
              {[
                { value: '', label: t('viewList') },
                { value: 'kanban', label: t('viewBoard') },
              ].map((option) =>
                (option.value === 'kanban') === kanban ? (
                  <span
                    key={option.value || 'list'}
                    aria-current="page"
                    className="whitespace-nowrap rounded-md bg-surface px-3 py-1 text-foreground shadow-sm"
                  >
                    {option.label}
                  </span>
                ) : (
                  <Link
                    key={option.value || 'list'}
                    href={`/projects${option.value ? '?view=kanban' : ''}${
                      query ? `${option.value ? '&' : '?'}q=${encodeURIComponent(query)}` : ''
                    }`}
                    className="whitespace-nowrap rounded-md px-3 py-1 text-muted transition-colors hover:text-foreground"
                  >
                    {option.label}
                  </Link>
                )
              )}
            </div>
          </div>
        </div>

        {kanban ? (
          <div className="p-3">
            <ProjectsKanban
              columns={columns}
              confirmFor={['COMPLETED', 'CANCELLED']}
              labels={{
                confirmTitle: t('kanbanConfirmTitle'),
                confirmBody: t('kanbanConfirmBody'),
                confirm: tc('confirm'),
                cancel: tc('cancel'),
                empty: t('kanbanEmpty'),
                saveFailed: tc('saveFailed'),
              }}
            />
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">{t('number')}</th>
                  <th className="px-4 py-3 font-medium">{t('name')}</th>
                  <th className="px-4 py-3 font-medium">{t('customer')}</th>
                  <th className="px-4 py-3 font-medium">{t('city')}</th>
                  <th className="px-4 py-3 font-medium">{t('plannedStart')}</th>
                  <th className="px-4 py-3 font-medium">{t('status')}</th>
                  {showPrice && <th className="px-4 py-3 text-right font-medium">{t('price')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={showPrice ? 7 : 6} className="px-4 py-8 text-center text-muted">
                      {t('noResults')}
                    </td>
                  </tr>
                ) : (
                  projects.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3 tabular-nums text-muted">{p.number}</td>
                      <td className="px-4 py-3">
                        {/* High priority: a red mark in front of the name */}
                        {p.priority === 'HIGH' && (
                          <span
                            className="mr-1 font-bold text-red-700 dark:text-red-400"
                            title={t('priorityHigh')}
                          >
                            !
                          </span>
                        )}
                        <Link href={`/projects/${p.id}`} className="font-medium text-accent hover:underline">
                          {p.name}
                        </Link>
                        {/* Site checklists: how far the crew has ticked through */}
                        {(() => {
                          const items = p.checklists.flatMap((c) => c.items)
                          if (items.length === 0) return null
                          const done = items.filter((i) => i.ok !== null).length
                          const problems = items.filter((i) => i.ok === false).length
                          return (
                            <span
                              title={t('checklistProgressTitle')}
                              className={`ml-2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                                problems > 0
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                  : done === items.length
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-subtle text-muted'
                              }`}
                            >
                              {problems > 0 && '⚠ '}
                              {done}/{items.length}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-muted">{p.customer.name}</td>
                      <td className="px-4 py-3 text-muted">{p.city ?? '—'}</td>
                      <td className="px-4 py-3 tabular-nums text-muted">
                        {formatDate(p.plannedStart, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      {showPrice && (
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCurrency(p.price ? Number(p.price) : null, locale)}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </PagePanel>

      {!kanban && <Pagination page={page} total={total} />}
    </div>
  )
}
