import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { StatusBadge, STATUS_STYLES } from '@/components/status-badge'
import { PagePanel, pageTitle, pageToolbar, StickyHead } from '@/components/ui/page-panel'
import { LiveSearchInput } from '@/components/live-search'
import { StatusTabs } from '@/components/status-tabs'
import { getPrepTabConfig } from '@/lib/prep-tab-db'
import { BOARD_COOKIE, columnLabel, pickBoard } from '@/lib/boards'
import { getBoards } from '@/lib/boards-db'
import type { Prisma } from '@/generated/prisma/client'
import { Pagination } from '@/components/pagination'
import { PAGE_SIZE, parsePage } from '@/lib/pagination'
import { formatCurrency, formatDate } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import { ProjectStatus } from '@/generated/prisma/enums'
import { btn } from '@/components/ui/button'
import { opensBoard, projectsViewHref } from '@/lib/projects-view'
import { ALL_YEARS, belongsToYears, parseProjectYears, projectYearOptions } from '@/lib/project-years'
import { todayUtc } from '@/lib/dates'
import { ProjectsKanban, type KanbanColumn } from './kanban'
import { ProjectYearPicker } from './year-picker'
import { BoardTabs } from './board-tabs'

const STATUSES = Object.keys(ProjectStatus) as ProjectStatus[]

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; view?: string; year?: string | string[]; board?: string }>
}) {
  const user = await requireManagement()
  const { q, status, page: pageParam, view, year: yearValue, board: boardParam } = await searchParams
  // A year repeated in the address ("?year=2025&year=2026") comes as a list.
  const yearParam = Array.isArray(yearValue) ? yearValue.join(',') : yearValue
  const page = parsePage(pageParam)
  const kanban = opensBoard({ view, status, page: pageParam })
  // A list reached by a status link (the dashboard's "in progress", say) is a
  // list only while that status is in the address. Its own "Alle Status" tab
  // takes the status away, which would turn it into the board under the
  // cursor — so the list names itself once it is showing.
  if (!kanban && view !== 'list') {
    const params = new URLSearchParams({ view: 'list' })
    for (const [key, value] of Object.entries({ q, status, page: pageParam, year: yearParam, board: boardParam }))
      if (value) params.set(key, value)
    redirect(`/projects?${params.toString()}`)
  }
  const [t, tStatus, tTemplates, tChecklists, tDrafts, tc, locale] = await Promise.all([
    getTranslations('projects'),
    getTranslations('status'),
    getTranslations('templates'),
    getTranslations('checklists'),
    getTranslations('drafts'),
    getTranslations('common'),
    getLocale(),
  ])
  const hidePrices = await pricesHidden()

  const currentYear = todayUtc().getUTCFullYear()
  const years = parseProjectYears(yearParam, currentYear)
  const [prepTab, boards, dated, statusChanges] = await Promise.all([
    getPrepTabConfig(),
    getBoards(),
    // The dates every project is filed under a year by. The rule is a few lines
    // of plain code (src/lib/project-years.ts) rather than a query, so it is
    // tested; the rows it needs are small.
    db.project.findMany({
      select: {
        id: true,
        status: true,
        plannedStart: true,
        plannedEnd: true,
        actualStart: true,
        actualEnd: true,
        sourceCreatedAt: true,
        createdAt: true,
      },
    }),
    // A card moved this year belongs to this year, whatever its dates say.
    db.auditLog.findMany({ where: { entity: 'Project', field: 'status' }, select: { entityId: true, createdAt: true } }),
  ])
  // Which board: the address, else the one this browser opened last, else the first.
  const board = pickBoard(boards, boardParam, (await cookies()).get(BOARD_COOKIE)?.value)
  const boardStatuses = (board?.columns ?? []).map((c) => c.status as ProjectStatus)
  const changedYears = new Map<string, number[]>()
  for (const change of statusChanges) {
    const years = changedYears.get(change.entityId) ?? []
    years.push(change.createdAt.getUTCFullYear())
    changedYears.set(change.entityId, years)
  }
  const filed = dated.map((p) => ({ ...p, statusChangedYears: changedYears.get(p.id) }))
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
  // The year picker narrows everything below it — tabs, counts, list and board.
  const yearWhere: Prisma.ProjectWhereInput =
    years === ALL_YEARS ? {} : { id: { in: filed.filter((p) => belongsToYears(p, years, currentYear)).map((p) => p.id) } }
  const searchWhere: Prisma.ProjectWhereInput = {
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
  const where: Prisma.ProjectWhereInput = { ...statusWhere, ...searchWhere, ...yearWhere }

  // Tab counts respect the search query but not the status filter itself.
  const { status: _ignored, scheduleEntries: _ignoredEntries, ...whereWithoutStatus } = where
  const [projects, total, statusCounts, draftCount, prepCount, searchInAllYears] = await Promise.all([
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
    // A search for an old job number must not simply come back empty because
    // the page stands on this year: the other years' hits are counted and
    // offered — with the same filter the view draws, so the link never
    // promises rows that page will not show (a status tab on the list, the
    // configured columns on the board).
    query && years !== ALL_YEARS
      ? db.project.count({
          where: kanban
            ? { ...searchWhere, status: { in: boardStatuses } }
            : { ...statusWhere, ...searchWhere },
        })
      : Promise.resolve(0),
  ])
  const countByStatus = new Map(statusCounts.map((s) => [s.status, s._count._all]))
  /**
   * The board reads the same search as the list, but never its status filter:
   * a board with one column is a list with extra steps. Every card of every
   * column is sent — the same rows the board already had to read to count them
   * — and the column shows the first fifty, with the rest a click away. Paging
   * this from the server would mean a round trip to see cards the page is
   * already holding.
   */
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
  // Which statuses get a column, and what each is called, is the board's own
  // (Einstellungen → Boards); a project stands on every board with a column
  // for its status.
  const columns: KanbanColumn[] = (board?.columns ?? []).map((column) => {
    const value = column.status as ProjectStatus
    const own = boardProjects.filter((p) => p.status === value)
    const sum = own.reduce((total, p) => total + (p.price ? Number(p.price) : 0), 0)
    return {
      status: value,
      label: columnLabel(column, tStatus(value)),
      count: own.length,
      sum: showPrice && sum > 0 ? formatCurrency(sum, locale, { hidden: hidePrices }) : null,
      badgeClass: STATUS_STYLES[value],
      cards: own.map((p) => ({
        id: p.id,
        number: p.number,
        name: p.name,
        customer: p.customer.name,
        city: p.city,
        start: p.plannedStart ? formatDate(p.plannedStart, locale) : null,
        price: showPrice ? formatCurrency(p.price ? Number(p.price) : null, locale, { hidden: hidePrices }) : null,
        urgent: p.priority === 'HIGH',
        status: p.status,
      })),
    }
  })
  const allCount = statusCounts.reduce((sum, s) => sum + s._count._all, 0)
  const shownInYear = kanban ? boardProjects.filter((p) => boardStatuses.includes(p.status)).length : total
  const otherYearHits = query && years !== ALL_YEARS ? Math.max(0, searchInAllYears - shownInYear) : 0
  const allYearsHref = (() => {
    const params = new URLSearchParams()
    if (view) params.set('view', view)
    if (status) params.set('status', status)
    if (query) params.set('q', query)
    if (boardParam) params.set('board', boardParam)
    params.set('year', ALL_YEARS)
    return `/projects?${params.toString()}`
  })()

  /** The picker offers every year some project touches (src/lib/project-years.ts). */
  const yearPicker = (
    <ProjectYearPicker
      options={projectYearOptions(filed, currentYear, years === ALL_YEARS ? [] : years)}
      selected={years}
      currentYear={currentYear}
    />
  )
  /**
   * The search box, with the other years' hits hanging under it. The hint sits
   * in the padding below the row rather than in it: appearing while somebody
   * types, it must not push the picker and the switch aside or onto a new line.
   */
  const search = (
    <div className="relative flex min-w-0 max-w-md flex-1">
      <LiveSearchInput placeholder={t('searchPlaceholder')} />
      {otherYearHits > 0 && (
        <Link
          href={allYearsHref}
          className="absolute left-1 top-full max-w-full truncate text-[11px] leading-[14px] text-accent hover:underline"
        >
          {t('otherYearsHits', { count: otherYearHits })} →
        </Link>
      )}
    </div>
  )

  /** Which year, and list or board: the same projects, two ways of drawing
   *  them. Written once because it sits on a different row in each view. */
  const viewSwitch = (
    <div className="order-1 ml-auto flex shrink-0 items-center gap-2 lg:order-2">
    {yearPicker}
    <div className="flex shrink-0 items-center gap-1 rounded-lg bg-subtle p-1 text-sm font-medium">
      {[
        { value: 'list', label: t('viewList') },
        { value: '', label: t('viewBoard') },
      ].map((option) =>
        (option.value === '') === kanban ? (
          <span
            key={option.value || 'board'}
            aria-current="page"
            className="whitespace-nowrap rounded-md bg-surface px-3 py-1.5 text-foreground shadow-sm"
          >
            {option.label}
          </span>
        ) : (
          <Link
            key={option.value || 'board'}
            href={projectsViewHref(option.value ? 'list' : 'board', { q: query, year: yearParam, board: boardParam })}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-muted transition-colors hover:text-foreground"
          >
            {option.label}
          </Link>
        )
      )}
    </div>
    </div>
  )

  return (
    /*
     * As a list the page is as long as its twenty rows and scrolls normally.
     * As a board it is exactly as tall as the window and nothing on it scrolls
     * but the inside of a column: a board whose columns grow with their
     * contents is a board where the busiest column decides how far everybody
     * scrolls, and where the column heads — the status and the count, the
     * whole point of the thing — walk off the top of the window. It holds from
     * the tablet up, which is where the board is actually used; on a phone it
     * goes back to growing with its contents, because a column with its own
     * scroll inside a screen that small is two scrolls fighting each other.
     *
     * Its sheet ends where the sidebar's panel ends, eight pixels above the
     * window's edge: the page starts eight pixels down and is the window less
     * both eights tall. The main area's bottom padding is wider than that, so
     * the board gives back the difference — otherwise the page would be a
     * little taller than the window and scroll for nothing.
     */
    <div className={kanban ? 'flex flex-col gap-4 md:-mb-4 md:h-[calc(100vh-1rem)]' : 'space-y-4'}>
      <StickyHead>
        <div className={pageToolbar}>
          <h1 className={pageTitle}>{t('title')}</h1>
          <div className="flex items-center gap-2">
            {/* The Excel import lives in Einstellungen → Daten, with the other
                two importers. It is set up once, not reached for daily. */}
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

      <PagePanel className={kanban ? 'flex min-h-0 flex-1 flex-col' : ''}>
        {/*
          Two choices about the same projects: the status tabs say which are
          shown, the year and the switch say which years and how they are
          drawn. Year and switch ride on the tabs' row — same kind of track,
          same height — because that is where the eye already is. The board has
          no status tabs, and rather than leave their row standing empty above
          the search, they share the search's row there instead: one row
          either way, and year and switch in the same spot in both views.

          Below lg that row is too narrow for both, and the two views would
          wrap at different widths — so there year and switch take a line of
          their own at the top, in both views alike.
        */}
        <div className="space-y-3 border-b border-border p-4">
          {kanban ? (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              {/* The boards first, the way Trello lines them up, and the search
                  beside them: which board, then what on it. */}
              <div className="order-2 flex min-w-0 flex-1 flex-wrap items-center gap-3 lg:order-1">
                <BoardTabs
                  boards={boards.map((b) => ({ id: b.id, name: b.name }))}
                  current={board?.id ?? ''}
                  ariaLabel={t('boardTabs')}
                  manage={user.role === 'ADMIN' ? { href: '/settings/boards', label: t('boardsManage') } : null}
                />
                {search}
              </div>
              {viewSwitch}
            </div>
          ) : (
            <>
              {/* Aligned at the top, not the middle: when there are more
                  status tabs than fit, their strip carries a scrollbar under
                  them and grows taller than the switch. Centred, that pushes
                  the switch half a scrollbar down and the two tracks no longer
                  read as one row. Both are the same height, so starting them
                  together lines them up either way. */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="order-2 min-w-0 flex-1 lg:order-1">
                  <StatusTabs
                    allLabel={t('allStatuses')}
                    allCount={allCount}
                    tabs={[
                      ...(prepTab.enabled
                        ? [
                            {
                              value: 'prep',
                              label: prepTab.label || t('tabPreparation'),
                              count: prepCount,
                            },
                          ]
                        : []),
                      // Every status keeps its tab, also at 0: a tab that
                      // came and went with the year would move the others
                      // along the strip under the cursor.
                      ...STATUSES.map((s) => ({
                        value: s,
                        label: tStatus(s),
                        count: countByStatus.get(s) ?? 0,
                      })),
                    ]}
                  />
                </div>
                {viewSwitch}
              </div>
              <div className="flex">{search}</div>
            </>
          )}
        </div>

        {kanban ? (
          <div className="min-h-0 flex-1 p-3">
            <ProjectsKanban
              // A new board is a new component: what a column was showing
              // beyond its first fifty belongs to the board it was on.
              key={board?.id ?? 'none'}
              boardId={board?.id ?? ''}
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
            <table className={`w-full table-fixed text-sm ${showPrice ? 'min-w-[1096px]' : 'min-w-[936px]'}`}>
              <colgroup>
                <col className="w-28" />
                <col />
                <col className="w-[16%]" />
                <col className="w-40" />
                <col className="w-40" />
                <col className="w-40" />
                {showPrice && <col className="w-36" />}
              </colgroup>
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
                      <td className="truncate px-4 py-3 tabular-nums text-muted" title={p.number}>{p.number}</td>
                      <td className="break-words px-4 py-3">
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
                      <td className="break-words px-4 py-3 text-muted">{p.customer.name}</td>
                      <td className="break-words px-4 py-3 text-muted">{p.city ?? '—'}</td>
                      <td className="px-4 py-3 tabular-nums text-muted">
                        {formatDate(p.plannedStart, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      {showPrice && (
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCurrency(p.price ? Number(p.price) : null, locale, { hidden: hidePrices })}
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
