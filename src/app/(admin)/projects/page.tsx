import { Suspense } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireStaff, canViewFinancials, isOffice } from '@/lib/authz'
import { projectScope } from '@/lib/project-scope'
import { STATUS_STYLES } from '@/components/status-badge'
import { nextStatus } from '@/lib/status-flow'
import { ListStatus } from './list-status'
import { PagePanel, pageTitle, pageToolbar, StickyHead } from '@/components/ui/page-panel'
import { LiveSearchInput } from '@/components/live-search'
import { StatusTabs } from '@/components/status-tabs'
import { getPrepTabConfig } from '@/lib/prep-tab-db'
import { BOARD_COOKIE, boardBackgroundCss, columnLabel, pickBoard } from '@/lib/boards'
import { getBoards } from '@/lib/boards-db'
import type { Prisma } from '@/generated/prisma/client'
import { Pagination } from '@/components/pagination'
import { PAGE_SIZE, parsePage } from '@/lib/pagination'
import { formatCurrency, formatDate } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import { ProjectStatus } from '@/generated/prisma/enums'
import { btn } from '@/components/ui/button'
import { X } from 'lucide-react'
import { narrowedStatuses, opensBoard, projectsViewHref } from '@/lib/projects-view'
import { ALL_YEARS, belongsToYears, parseProjectYears, projectYearOptions } from '@/lib/project-years'
import { todayUtc } from '@/lib/dates'
import { ProjectsKanban, type KanbanColumn } from './kanban'
import { BoardMenu } from './board-menu'
import { ListMenu } from './list-menu'
import { ArchiveButton } from './archive-button'
import { DeleteButton } from '@/components/delete-button'
import { deleteArchivedProject } from './actions'
import { orderCards } from '@/lib/board-order'
import { COLUMN_RULES, columnFor, columnRuleKey, RULE_STATUS } from '@/lib/board-rules'
import { StatusBadge } from '@/components/status-badge'
import { ProjectYearPicker } from './year-picker'
import { BoardTabs } from './board-tabs'
import { sitesPreset } from '@/lib/board-presets'
import { BoardFilter } from './board-filter'
import { CardSheet, SheetClose } from './card-sheet'
import type { CardMovePlaces } from './card-move'
import { ProjectDetail } from './[id]/project-detail'
import { TemplateSheet } from './template-sheet'
import type { BoardTemplate } from './card-templates'
import { LiveRefresh } from '@/components/live-refresh'
import { Check } from 'lucide-react'
import { activitySince, addressLine, cardFieldLines, dateTone, dueFilterRange, dueTone, initials, labelSwatch, parseBoardFilter, swatchOf } from '@/lib/board-cards'
import { orderValue } from '@/lib/reports'
import { describeAudit } from '@/lib/card-history'
import { PERSON_SWATCH } from '@/components/swatches'

const STATUSES = Object.keys(ProjectStatus) as ProjectStatus[]

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    status?: string
    page?: string
    view?: string
    year?: string | string[]
    board?: string
    member?: string
    label?: string
    urgent?: string
    due?: string
    /** Trello's card status in the filter: "1" done, "0" not. */
    done?: string
    /** Trello's activity filter: 1w, 2w, 4w or stale. */
    activity?: string
    card?: string
    /** A card template opened over the board, from the templates at the foot of a list. */
    template?: string
    archived?: string
    /** What the archive panel is searched for. */
    aq?: string
    /** Trello's board activity: the panel open, with this many lines. */
    feed?: string
  }>
}) {
  const user = await requireStaff()
  const { q, status, page: pageParam, view, year: yearValue, board: boardParam, member, label, urgent, due, done, activity, card, template: templateParam, archived, aq, feed } =
    await searchParams
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
    for (const [key, value] of Object.entries({ q, status, page: pageParam, year: yearParam, board: boardParam, member, label, urgent, due, done, activity }))
      if (value) params.set(key, value)
    redirect(`/projects?${params.toString()}`)
  }
  const [t, tStatus, tTemplates, tChecklists, tDrafts, tc, locale, tForms] = await Promise.all([
    getTranslations('projects'),
    getTranslations('status'),
    getTranslations('templates'),
    getTranslations('checklists'),
    getTranslations('drafts'),
    getTranslations('common'),
    getLocale(),
    getTranslations('forms'),
  ])
  const hidePrices = await pricesHidden()
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'
  // This very address — where the open card's forms return to.
  const here = new URLSearchParams()
  for (const [key, value] of Object.entries({ q, status, page: pageParam, view, year: yearParam, board: boardParam, member, label, urgent, due, done, activity, card, archived, aq, feed }))
    if (value) here.set(key, value)
  const returnTo = `/projects?${here.toString()}`
  /** This address with the archive panel open, and without it. */
  const archivedHref = (open: boolean) => {
    const params = new URLSearchParams(here)
    params.delete('card')
    params.delete('feed')
    if (open) params.set('archived', '1')
    else {
      params.delete('archived')
      params.delete('aq')
    }
    return `/projects?${params.toString()}`
  }
  /** Trello's board activity: how many lines it shows, and this address with it open (more of it) or closed. */
  const feedSize = feed ? Math.min(500, Math.max(50, Number(feed) || 50)) : 0
  /** A card opened over the board from the activity, the panel staying open beside it. */
  const openCardHref = (id: string) => {
    const params = new URLSearchParams(here)
    params.set('card', id)
    return `/projects?${params.toString()}`
  }
  const feedHref = (size: number | null) => {
    const params = new URLSearchParams(here)
    params.delete('card')
    params.delete('archived')
    params.delete('aq')
    if (size) params.set('feed', String(size))
    return `/projects?${params.toString()}`
  }

  const today = todayUtc()
  const currentYear = today.getUTCFullYear()
  const years = parseProjectYears(yearParam, currentYear)
  // The filter beside the search, in both views: one person, one trade, urgent only, a due.
  const filter = parseBoardFilter({ member, label, urgent, due, done, activity })
  const dueWhere = (): Prisma.ProjectWhereInput => {
    if (!filter.due) return {}
    const range = dueFilterRange(filter.due, today)
    // "Ohne Termin": neither a planned start nor a day the work is due by.
    if (filter.due === 'none') return { plannedStart: null, dueDate: null }
    return { dueDate: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } }
  }
  // Within people, and within labels, any choice will do — Trello's filter; between them all must hold.
  const meId = user.employee?.id ?? null
  const memberIds = filter.members.map((m) => (m === 'me' ? meId : m)).filter((m): m is string => Boolean(m) && m !== 'none')
  const memberOr: Prisma.ProjectWhereInput[] = [
    ...(filter.members.includes('none') ? [{ managerId: null, team: { none: {} } }] : []),
    ...(memberIds.length > 0 ? [{ managerId: { in: memberIds } }, { team: { some: { employeeId: { in: memberIds } } } }] : []),
  ]
  const tradeIds = filter.labels.filter((l) => l !== 'none')
  const labelOr: Prisma.ProjectWhereInput[] = [
    ...(filter.urgent ? [{ priority: 'HIGH' }] : []),
    ...(filter.labels.includes('none') ? [{ workCategories: { none: {} } }] : []),
    ...(tradeIds.length > 0 ? [{ workCategories: { some: { workCategoryId: { in: tradeIds } } } }] : []),
  ]
  // Something happened on it: the project changed, somebody wrote, a file came.
  const since = filter.activity ? activitySince(filter.activity, new Date()) : null
  const activeWhere: Prisma.ProjectWhereInput | null = since
    ? { OR: [{ updatedAt: { gte: since } }, { notes: { some: { createdAt: { gte: since } } } }, { documents: { some: { createdAt: { gte: since } } } }] }
    : null
  const filterWhere: Prisma.ProjectWhereInput = {
    AND: [
      // "Mir zugewiesen" for an account without a person behind it is nobody's card.
      ...(memberOr.length > 0 ? [{ OR: memberOr }] : filter.members.length > 0 ? [{ id: { in: [] } }] : []),
      ...(labelOr.length > 0 ? [{ OR: labelOr }] : []),
      dueWhere(),
      ...(filter.done !== null ? [{ doneAt: filter.done ? { not: null } : null }] : []),
      ...(activeWhere ? [filter.activity === 'stale' ? { NOT: activeWhere } : activeWhere] : []),
    ],
  }
  const [prepTab, boards, dated, statusChanges, people, trades, customerOptions, templateOptions] = await Promise.all([
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
        planMonth: true,
        actualStart: true,
        actualEnd: true,
        sourceCreatedAt: true,
        createdAt: true,
      },
    }),
    // A card moved this year belongs to this year, whatever its dates say.
    db.auditLog.findMany({ where: { entity: 'Project', field: 'status' }, select: { entityId: true, createdAt: true } }),
    // What the filter offers.
    db.employee.findMany({
      where: { active: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
    db.workCategory.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, nameDe: true, nameEn: true, color: true } }),
    // The customers a card added on the board can be given, and the templates it can be made from —
    // with what each carries, since the templates are drawn as the cards they make.
    kanban ? db.customer.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }) : Promise.resolve([]),
    kanban
      ? db.projectTemplate.findMany({
          where: { active: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            workCategory: { select: { id: true, nameDe: true, nameEn: true, color: true } },
            manager: { select: { id: true, firstName: true, lastName: true } },
            employees: { select: { employee: { select: { id: true, firstName: true, lastName: true } } } },
            checklists: { select: { checklistTemplate: { select: { _count: { select: { items: true } } } } } },
            _count: { select: { vehicles: true, deviceNeeds: true, items: true } },
          },
        })
      : Promise.resolve([]),
  ])
  // The cards the reader follows wear Trello's eye.
  const watched = new Set(
    kanban ? (await db.cardWatch.findMany({ where: { userId: user.id }, select: { projectId: true } })).map((w) => w.projectId) : []
  )
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
  // Everything but the status tab: the search, the year and the filter. The
  // filter's own OR must not overwrite the search's — two wheres, both.
  // A site manager's list is the projects they are named on; the office's is every one.
  const scope = projectScope(user) ?? {}
  const whereWithoutStatus: Prisma.ProjectWhereInput = { AND: [{ ...searchWhere, ...yearWhere }, filterWhere, scope, { archivedAt: null }] }
  const where: Prisma.ProjectWhereInput = { AND: [statusWhere, whereWithoutStatus] }
  /**
   * A status tab that came along from the list leaves only its own columns on
   * the board — "In Ausführung" there is "In Ausführung" here. A board with no
   * column for it is shown whole (src/lib/projects-view.ts).
   */
  const wantedStatuses = statusFilter ? [statusFilter] : prepFilter ? (prepTab.statuses as string[]) : null
  const narrowed = kanban ? narrowedStatuses(boardStatuses, wantedStatuses) : null
  const shownStatuses = (narrowed ?? boardStatuses) as ProjectStatus[]

  // Tab counts respect the search and the filter but not the status tab itself.
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
    prepTab.enabled ? db.project.count({ where: { AND: [whereWithoutStatus, prepWhere] } }) : Promise.resolve(0),
    // A search for an old job number must not simply come back empty because
    // the page stands on this year: the other years' hits are counted and
    // offered — with the same filter the view draws, so the link never
    // promises rows that page will not show (a status tab on the list, the
    // configured columns on the board).
    query && years !== ALL_YEARS
      ? db.project.count({
          where: kanban
            ? { AND: [searchWhere, filterWhere, scope, narrowed ? statusWhere : {}], status: { in: shownStatuses } }
            : { AND: [statusWhere, searchWhere, filterWhere, scope] },
        })
      : Promise.resolve(0),
  ])
  const countByStatus = new Map(statusCounts.map((s) => [s.status, s._count._all]))
  /**
   * The board reads the same search and filter as the list. A status tab is
   * read only when it was brought along from the list — then the board is
   * those columns and no others. Every card of every column is sent — the same rows the board already had to read to count them
   * — and the column shows the first fifty, with the rest a click away. Paging
   * this from the server would mean a round trip to see cards the page is
   * already holding.
   */
  const boardProjects = kanban
    ? await db.project.findMany({
        where: narrowed ? where : whereWithoutStatus,
        select: {
          id: true,
          number: true,
          name: true,
          street: true,
          postalCode: true,
          city: true,
          status: true,
          price: true,
          addOns: { select: { amount: true } },
          priority: true,
          isSub: true,
          plannedStart: true,
          plannedEnd: true,
          planMonth: true,
          dueDate: true,
          inspectionDate: true,
          executionWish: true,
          sourceCreatedAt: true,
          createdAt: true,
          boardPosition: true,
          coverDocumentId: true,
          description: true,
          pausedAt: true,
          doneAt: true,
          invoices: { where: { part: 1 }, select: { id: true } },
          customer: { select: { name: true, number: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
          team: { select: { employee: { select: { id: true, firstName: true, lastName: true } } } },
          workCategories: { select: { workCategory: { select: { id: true, nameDe: true, nameEn: true, color: true } } } },
          checklists: { select: { items: { select: { ok: true } } } },
          _count: { select: { documents: true, cardLinks: true, notes: true, defects: { where: { resolvedAt: null } }, tasks: { where: { doneAt: null } } } },
        },
        orderBy: { number: 'desc' },
      })
    : []
  const dayMonth = new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  // A job with no day fixed yet shows the month it is placed in — "Okt. 2026".
  const monthShort = new Intl.DateTimeFormat(intl, { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const dayMonthYear = new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', year: '2-digit' })
  /** Up to this many people are drawn on a card; the rest are a count. */
  const FACES = 3
  // Which statuses get a column, and what each is called, is the board's own
  // (Einstellungen → Boards); a project stands on every board with a column
  // for its status.
  const boardColumns = (board?.columns ?? []).filter((column) => shownStatuses.includes(column.status as ProjectStatus))
  const columnKeys = boardColumns.map((c) => ({ key: c.id, status: c.status, rule: c.rule }))
  /** A rule's name on a list: "Pause", "Nächstes Jahr (2027)" … */
  const ruleLabel = (rule: string) => t(`rule_${rule}` as 'rule_paused', { year: currentYear + 1 })
  // Where each card stands: the rule column that picks it, else the plain one of its status.
  const columnOf = new Map<string, string>()
  for (const p of boardProjects) {
    const target = columnFor(
      columnKeys,
      p.status,
      { pausedAt: p.pausedAt, plannedStart: p.plannedStart, planMonth: p.planMonth, priority: p.priority, invoice1: p.invoices.length > 0 },
      currentYear
    )
    if (target) columnOf.set(p.id, target.key)
  }
  const columns: KanbanColumn[] = boardColumns.map((column) => {
    const value = column.status as ProjectStatus
    // In the order they were put: the placed cards by their place, the rest newest first.
    const own = orderCards(boardProjects.filter((p) => columnOf.get(p.id) === column.id).map((p) => ({ ...p, position: p.boardPosition })))
    // The order's worth: the price and what was added to it since.
    const sum = own.reduce((total, p) => total + (orderValue(p.price, p.addOns) ?? 0), 0)
    const rule = columnRuleKey(column.rule)
    return {
      id: column.id,
      status: value,
      rule,
      label: columnLabel(column, rule ? ruleLabel(rule) : tStatus(value)),
      count: own.length,
      sum: showPrice && sum > 0 ? formatCurrency(sum, locale, { hidden: hidePrices }) : null,
      badgeClass: STATUS_STYLES[value],
      cards: own.map((p) => {
        // The site manager first, then the team, nobody twice.
        const seen = new Set<string>()
        const people = [
          ...(p.manager ? [{ ...p.manager, manager: true }] : []),
          ...p.team.map((m) => ({ ...m.employee, manager: false })),
        ].filter((e) => !seen.has(e.id) && seen.add(e.id))
        const items = p.checklists.flatMap((c) => c.items)
        const dates = [p.plannedStart, p.plannedEnd].filter((d): d is Date => d !== null).map((d) => dayMonth.format(d))
        const rough = dates.length === 0 && p.planMonth ? monthShort.format(p.planMonth) : null
        const value = orderValue(p.price, p.addOns)
        const trades = p.workCategories.map((wc) => (locale === 'en' ? wc.workCategory.nameEn : wc.workCategory.nameDe))
        return {
          id: p.id,
          number: p.number,
          name: p.name,
          customer: p.customer.name,
          customerNumber: p.customer.number,
          address: addressLine(p.street, p.postalCode, p.city),
          dates:
            dates.length > 0
              ? { text: dates.join(' – '), tone: dateTone(p.status, p.plannedStart, p.plannedEnd, today) }
              : rough
                ? { text: rough, tone: null }
                : null,
          due: p.dueDate ? { text: dayMonth.format(p.dueDate), tone: dueTone(p.status, p.dueDate, today) } : null,
          // A card brought over from another board keeps the day it was made there.
          created: dayMonthYear.format(p.sourceCreatedAt ?? p.createdAt),
          // No figure rather than a dash: a card has no room for an empty one.
          price:
            showPrice && orderValue(p.price, p.addOns) != null
              ? formatCurrency(orderValue(p.price, p.addOns), locale, { hidden: hidePrices })
              : null,
          urgent: p.priority === 'HIGH',
          sub: p.isSub,
          status: p.status,
          labels: p.workCategories.map((wc) => ({
            text: locale === 'en' ? wc.workCategory.nameEn : wc.workCategory.nameDe,
            swatch: labelSwatch(wc.workCategory.color, wc.workCategory.id),
          })),
          checklist:
            items.length > 0
              ? { done: items.filter((i) => i.ok !== null).length, total: items.length, problems: items.filter((i) => i.ok === false).length }
              : null,
          // Trello counts the links with the files.
          files: p._count.documents + p._count.cardLinks,
          comments: p._count.notes,
          defects: p._count.defects,
          tasks: p._count.tasks,
          people: people.slice(0, FACES).map((e) => {
            const name = `${e.firstName} ${e.lastName}`.trim()
            return { initials: initials(name), name, swatch: swatchOf(e.id), manager: e.manager }
          }),
          more: Math.max(0, people.length - FACES),
          cover: p.coverDocumentId,
          hasDescription: Boolean(p.description?.trim()),
          done: p.doneAt !== null,
          watching: watched.has(p.id),
          // The lines under the marks, in the order the client's Trello cards
          // show them; the order value only for whoever may see money.
          fields: cardFieldLines({
            customer: p.customer.name,
            address: addressLine(p.street, p.postalCode, p.city),
            value: showPrice && value != null ? formatCurrency(value, locale, { hidden: hidePrices }) : null,
            workType: trades.join(', '),
            wish: p.executionWish,
            inspection: p.inspectionDate ? formatDate(p.inspectionDate, locale) : null,
            created: formatDate(p.sourceCreatedAt ?? p.createdAt, locale),
            customerNumber: p.customer.number,
          }),
        }
      }),
    }
  })
  // The card templates at the foot of every list, drawn as the cards they
  // make: the trade as the label, the ≡, the checklists' points, the people.
  const boardTemplates: BoardTemplate[] = templateOptions.map((tp) => {
    const seen = new Set<string>()
    const people = [
      ...(tp.manager ? [{ ...tp.manager, manager: true }] : []),
      ...tp.employees.map((e) => ({ ...e.employee, manager: false })),
    ].filter((e) => !seen.has(e.id) && seen.add(e.id))
    return {
      id: tp.id,
      name: tp.name,
      hasDescription: Boolean(tp.description?.trim()),
      label: tp.workCategory
        ? {
            text: locale === 'en' ? tp.workCategory.nameEn : tp.workCategory.nameDe,
            swatch: labelSwatch(tp.workCategory.color, tp.workCategory.id),
          }
        : null,
      checkItems: tp.checklists.reduce((sum, c) => sum + c.checklistTemplate._count.items, 0),
      people: people.slice(0, FACES).map((e) => {
        const name = `${e.firstName} ${e.lastName}`.trim()
        return { initials: initials(name), name, swatch: swatchOf(e.id), manager: e.manager }
      }),
      more: Math.max(0, people.length - FACES),
      counts: {
        labels: tp.workCategory ? 1 : 0,
        members: people.length,
        checklists: tp.checklists.length,
        vehicles: tp._count.vehicles,
        devices: tp._count.deviceNeeds,
        items: tp._count.items,
      },
    }
  })
  // What "+ Weitere Liste" offers: the statuses the board has no plain list
  // for, and the rule lists it does not have yet — each named with its status.
  const has = (status: string, rule: string | null) =>
    (board?.columns ?? []).some((c) => c.status === status && (columnRuleKey(c.rule) ?? null) === rule)
  const addable = [
    ...STATUSES.filter((s) => !has(s, null)).map((s) => ({ value: s, rule: null as string | null, label: tStatus(s) })),
    ...COLUMN_RULES.filter((rule) => !has(RULE_STATUS[rule], rule)).map((rule) => ({
      value: RULE_STATUS[rule],
      rule: rule as string | null,
      label: `${ruleLabel(rule)} (${tStatus(RULE_STATUS[rule] as ProjectStatus)})`,
    })),
  ]
  // The archive: what was put away, newest first, for the panel beside the board.
  const archiveQuery = (aq ?? '').trim()
  const archivedProjects =
    kanban && archived === '1'
      ? await db.project.findMany({
          where: {
            AND: [
              scope,
              { archivedAt: { not: null } },
              archiveQuery
                ? {
                    OR: [
                      { number: { contains: archiveQuery, mode: 'insensitive' } },
                      { name: { contains: archiveQuery, mode: 'insensitive' } },
                      { customer: { name: { contains: archiveQuery, mode: 'insensitive' } } },
                    ],
                  }
                : {},
            ],
          },
          orderBy: { archivedAt: 'desc' },
          take: 200,
          select: { id: true, number: true, name: true, status: true, archivedAt: true, customer: { select: { name: true } } },
        })
      : []
  /**
   * Trello's board activity: the cards' history, newest first — the same
   * words each card's own activity uses. A site manager reads only the cards
   * named on them; money never appears (an invoice line names no amount, and
   * reaches only those who may see money).
   */
  const feedLines = await (async () => {
    if (!kanban || !feedSize) return null
    const visible = projectScope(user) ? (await db.project.findMany({ where: scope, select: { id: true } })).map((p) => p.id) : null
    const rows = await db.auditLog.findMany({
      where: {
        entity: 'Project',
        ...(visible ? { entityId: { in: visible } } : {}),
        ...(canViewFinancials(user) ? {} : { NOT: { action: { startsWith: 'project.invoice' } } }),
      },
      orderBy: { createdAt: 'desc' },
      take: feedSize + 1,
      select: {
        id: true,
        action: true,
        field: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        entityId: true,
        user: { select: { id: true, username: true, employee: { select: { firstName: true, lastName: true } } } },
      },
    })
    const cards = new Map(
      (await db.project.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.entityId))] } }, select: { id: true, number: true, name: true } })).map(
        (p) => [p.id, p]
      )
    )
    const tHistory = await getTranslations('history')
    const stamp = new Intl.DateTimeFormat(intl, { dateStyle: 'short', timeStyle: 'short' })
    const lines = rows.slice(0, feedSize).flatMap((row) => {
      const text = describeAudit(
        { ...row, user: row.user ? { username: row.user.username } : null },
        (key, values) => tHistory(key as 'created', values),
        (s) => (s in ProjectStatus ? tStatus(s as ProjectStatus) : s)
      )
      const cardRow = cards.get(row.entityId)
      if (!text || !cardRow) return []
      const who = row.user ? (row.user.employee ? `${row.user.employee.firstName} ${row.user.employee.lastName}`.trim() : row.user.username) : tHistory('system')
      return [{ id: row.id, who, initials: initials(who), swatch: row.user ? swatchOf(row.user.id) : 0, text, card: cardRow, when: stamp.format(row.createdAt) }]
    })
    return { lines, more: rows.length > feedSize }
  })()
  const allCount = statusCounts.reduce((sum, s) => sum + s._count._all, 0)
  const shownInYear = kanban ? boardProjects.filter((p) => shownStatuses.includes(p.status)).length : total
  const otherYearHits = query && years !== ALL_YEARS ? Math.max(0, searchInAllYears - shownInYear) : 0
  const allYearsHref = (() => {
    const params = new URLSearchParams()
    if (view) params.set('view', view)
    if (status) params.set('status', status)
    if (query) params.set('q', query)
    if (boardParam) params.set('board', boardParam)
    for (const [key, value] of Object.entries({ member, label, urgent, due, done, activity })) if (value) params.set(key, value)
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
    // Never narrower than its own box: a wrapper that shrank below the input
    // let the input run out over the filter button beside it on a phone. In a
    // wrapping row the box now takes a line of its own instead.
    <div className="relative flex min-w-52 max-w-md flex-1">
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

  const boardFilter = (
    <BoardFilter
      people={people.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }))}
      labels={trades.map((c) => ({ id: c.id, name: locale === 'en' ? c.nameEn : c.nameDe, swatch: labelSwatch(c.color, c.id) }))}
      current={filter}
      canMe={user.employee !== null}
    />
  )
  /** The status tab the board was narrowed to, with the way out of it. */
  const statusChip = narrowed && (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent">
      {t('boardStatusOnly', { status: statusFilter ? tStatus(statusFilter) : prepTab.label || t('tabPreparation') })}
      <Link
        href={projectsViewHref('board', { q: query, year: yearParam, board: boardParam, member, label, urgent, due, done, activity })}
        aria-label={t('boardStatusClear')}
        title={t('boardStatusClear')}
        className="rounded-full p-0.5 hover:bg-accent/20"
      >
        <X className="h-3 w-3" aria-hidden />
      </Link>
    </span>
  )

  /** Which year, and list or board: the same projects, two ways of drawing
   *  them. In the list it stands in the page's bar, top right — where the
   *  board's own bar has it too, so it is in one place in both views. */
  const viewSwitch = (
    <div className="flex shrink-0 items-center gap-2">
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
            href={projectsViewHref(option.value ? 'list' : 'board', {
              q: query,
              year: yearParam,
              board: boardParam,
              // A tab the board could not show is not carried back and forth.
              status: kanban ? (narrowed ? status : undefined) : wantedStatuses ? status : undefined,
              member,
              label,
              urgent,
              due,
            })}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-muted transition-colors hover:text-foreground"
          >
            {option.label}
          </Link>
        )
      )}
    </div>
    </div>
  )

  /**
   * Where the open card can be moved to, the way Trello's "Karte verschieben"
   * offers it: every board, every list on it, and — for the place in a list —
   * the cards already there, worked out from the cards this page has read.
   * The card's own list on this board is read afresh when the search or the
   * filter left the card out of the board.
   */
  const movePlaces: CardMovePlaces | null = card
    ? await (async () => {
        type Row = (typeof boardProjects)[number]
        const factsOf = (p: Pick<Row, 'pausedAt' | 'plannedStart' | 'planMonth' | 'priority' | 'invoices'>) => ({
          pausedAt: p.pausedAt,
          plannedStart: p.plannedStart,
          planMonth: p.planMonth,
          priority: p.priority,
          invoice1: p.invoices.length > 0,
        })
        const places = boards.map((b) => {
          const keys = b.columns.map((c) => ({ key: c.id, status: c.status, rule: c.rule }))
          const byColumn = new Map<string, Row[]>()
          for (const p of boardProjects) {
            const key = columnFor(keys, p.status, factsOf(p), currentYear)?.key
            if (key) byColumn.set(key, [...(byColumn.get(key) ?? []), p])
          }
          return {
            id: b.id,
            name: b.name,
            columns: b.columns.map((c) => {
              const rule = columnRuleKey(c.rule)
              return {
                id: c.id,
                label: columnLabel(c, rule ? ruleLabel(rule) : tStatus(c.status as ProjectStatus)),
                status: c.status,
                rule,
                cardIds: orderCards((byColumn.get(c.id) ?? []).map((p) => ({ ...p, position: p.boardPosition }))).map((p) => p.id),
              }
            }),
          }
        })
        let columnId = columnOf.get(card) ?? null
        if (!columnId && board) {
          const facts = await db.project.findUnique({
            where: { id: card },
            select: { status: true, pausedAt: true, plannedStart: true, planMonth: true, priority: true, invoices: { where: { part: 1 }, select: { id: true } } },
          })
          if (facts)
            columnId =
              columnFor(
                board.columns.map((c) => ({ key: c.id, status: c.status, rule: c.rule })),
                facts.status,
                factsOf(facts),
                currentYear
              )?.key ?? null
        }
        return { boardId: board?.id ?? null, columnId, boards: places }
      })()
    : null

  /** A card opened over the board or the list: the project's page in a sheet, the board still underneath. It streams in after the board. */
  const cardSheet = card && (
    <CardSheet>
      <Suspense
        fallback={
          <div className="flex items-center justify-between gap-3 p-4">
            <p className="px-2 py-6 text-sm text-muted">{t('cardLoading')}</p>
            <SheetClose />
          </div>
        }
      >
        <ProjectDetail id={card} sheet={{ returnTo, move: movePlaces }} />
      </Suspense>
    </CardSheet>
  )
  /** A card template opened over the board, the way Trello opens a template card — the office's. */
  const templateSheet = templateParam && isOffice(user) && (
    <CardSheet narrow>
      <Suspense
        fallback={
          <div className="flex items-center justify-between gap-3 p-4">
            <p className="px-2 py-6 text-sm text-muted">{t('cardLoading')}</p>
            <SheetClose />
          </div>
        }
      >
        <TemplateSheet
          id={templateParam}
          closeTo={(() => {
            const params = new URLSearchParams(here)
            params.delete('card')
            return `/projects?${params.toString()}`
          })()}
        />
      </Suspense>
    </CardSheet>
  )
  const sheet = cardSheet || templateSheet || null

  /** The office's own doors — drafts, templates — behind the board's menu; the site manager's board has none. */
  const officeLinks = isOffice(user)
    ? [
        ...(draftCount > 0 ? [{ href: '/projects/drafts', label: tDrafts('title'), count: draftCount }] : []),
        { href: '/projects/templates', label: tTemplates('title') },
        { href: '/projects/checklists', label: tChecklists('templatesTitle') },
        { href: '/projects/forms', label: tForms('templatesTitle') },
      ]
    : []
  // A photo stands before the colour, which shows while it loads and if it is gone.
  const colour = boardBackgroundCss(board?.background)
  const ground = board?.backgroundImage
    ? `url(/api/boards/${board.id}/background?v=${encodeURIComponent(board.backgroundImage)}) center / cover no-repeat${colour ? `, ${colour}` : ', #0079bf'}`
    : colour
  const onGround = ground !== null

  if (kanban) {
    /*
     * The board the way Trello draws one: edge to edge on its own ground, a
     * bar across the top with the boards, the search and the menu, and the
     * lists under it. It is exactly as tall as the window and nothing on it
     * scrolls but the inside of a list: a board whose lists grow with their
     * contents is a board where the busiest list decides how far everybody
     * scrolls, and where the heads walk off the top of the window. It holds
     * from the tablet up, which is where the board is actually used; on a
     * phone it goes back to growing with its contents, because a list with its
     * own scroll inside a screen that small is two scrolls fighting each other.
     *
     * The main area pads the page; the board takes the padding back with
     * negative margins so its ground reaches the edges, the way Trello's does.
     */
    const bar = onGround
      ? 'bg-black/25 text-white backdrop-blur-sm [&_input]:bg-white/90 [&_input]:text-foreground'
      : 'border-b border-border bg-surface'
    return (
      <div
        className="relative -mx-4 -mb-4 -mt-2 flex flex-col md:-mx-6 md:-mb-6 md:h-screen"
        style={ground ? { background: ground } : undefined}
      >
        <div className={`flex shrink-0 flex-wrap items-center gap-2 px-3 py-2 ${bar}`}>
          <BoardTabs
            boards={boards.map((b) => ({ id: b.id, name: b.name, background: b.background, backgroundImage: b.backgroundImage }))}
            current={board?.id ?? ''}
            ariaLabel={t('boardTabs')}
            manage={null}
            // Boards are made and changed in the bar by whoever may do it in the settings.
            manageBoards={
              user.role === 'ADMIN'
                ? { presets: [sitesPreset(new Date().getUTCFullYear())].map((p) => ({ key: p.key, name: p.name, background: p.background })) }
                : null
            }
            onGround={onGround}
          />
          {statusChip}
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
            {search}
            {boardFilter}
            {yearPicker}
            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-subtle p-1 text-sm font-medium">
              <Link
                href={projectsViewHref('list', { q: query, year: yearParam, board: boardParam, status: narrowed ? status : undefined, member, label, urgent, due, done, activity })}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-muted transition-colors hover:text-foreground"
              >
                {t('viewList')}
              </Link>
              <span aria-current="page" className="whitespace-nowrap rounded-md bg-surface px-3 py-1.5 text-foreground shadow-sm">
                {t('viewBoard')}
              </span>
            </div>
            {isOffice(user) && (
              <Link href="/projects/new" className={btn.primarySm}>
                {t('newProject')}
              </Link>
            )}
            <BoardMenu
              onGround={onGround}
              archivedHref={archivedHref(true)}
              activityHref={feedHref(50)}
              links={officeLinks}
              settingsHref={user.role === 'ADMIN' ? '/settings/boards' : null}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 px-3 pb-3 pt-2">
          <ProjectsKanban
            // A new board is a new component: what a column was showing
            // beyond its first fifty belongs to the board it was on.
            key={board?.id ?? 'none'}
            boardId={board?.id ?? ''}
            columns={columns}
            customers={customerOptions.map((c) => ({ value: c.id, label: c.name }))}
            templates={boardTemplates}
            manageTemplates={isOffice(user)}
            canJoin={user.employee !== null}
            onGround={onGround}
            confirmFor={['COMPLETED', 'CANCELLED']}
            addable={addable}
            canEditBoard={isOffice(user)}
            settingsHref={user.role === 'ADMIN' ? '/settings/boards' : null}
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

        {/* The archive, the way Trello's menu opens it: a panel over the right
            of the board, the cards that were put away, each with the way back. */}
        {archived === '1' && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">
                {t('boardArchived')}
                <span className="ml-2 text-xs font-normal tabular-nums text-muted">{archivedProjects.length}</span>
              </h2>
              <Link href={archivedHref(false)} aria-label={tc('close')} title={tc('close')} className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                <X className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            {/* Searched as it is typed into, the way Trello's archive is. */}
            <div className="flex border-b border-border px-4 py-2">
              <LiveSearchInput param="aq" placeholder={t('boardArchivedSearch')} />
            </div>
            {archivedProjects.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">{archiveQuery ? t('noResults') : t('boardArchivedNone')}</p>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                {archivedProjects.map((p) => (
                  <li key={p.id} className="space-y-1.5 px-4 py-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                        <span className="tabular-nums text-muted">{p.number}</span> {p.name}
                      </Link>
                      <StatusBadge status={p.status} />
                    </p>
                    <p className="text-xs text-muted">
                      {p.customer.name} · {t('boardArchivedOn', { date: p.archivedAt ? dayMonthYear.format(p.archivedAt) : '—' })}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <ArchiveButton projectId={p.id} archived label={t('cardRestore')} />
                      {/* Gone for good — the administrator's, as every delete is. */}
                      {user.role === 'ADMIN' && (
                        <DeleteButton
                          action={deleteArchivedProject.bind(null, p.id)}
                          label={tc('delete')}
                          confirmMessage={`${p.number} — ${p.name}: ${t('deleteConfirm')}`}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        {/* Trello's board activity, from the board's menu: a panel over the right of the
            board, who did what to which card, newest first; a card's name opens it. */}
        {feedLines && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">{t('boardActivity')}</h2>
              <Link href={feedHref(null)} aria-label={tc('close')} title={tc('close')} className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                <X className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            {feedLines.lines.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">{t('boardActivityNone')}</p>
            ) : (
              <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {feedLines.lines.map((line) => (
                  <li key={line.id} className="flex gap-2.5 text-sm">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${PERSON_SWATCH[line.swatch]}`}>
                      {line.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words">
                        <span className="font-semibold">{line.who}</span> {line.text}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        <Link href={openCardHref(line.card.id)} scroll={false} className="text-accent hover:underline">
                          {line.card.number} {line.card.name}
                        </Link>
                        {' · '}
                        <span className="tabular-nums">{line.when}</span>
                      </p>
                    </div>
                  </li>
                ))}
                {feedLines.more && (
                  <li>
                    <Link href={feedHref(feedSize + 50)} scroll={false} className="block rounded-md bg-subtle px-3 py-1.5 text-center text-sm font-medium transition-colors hover:bg-surface-hover">
                      {t('boardActivityMore')}
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </aside>
        )}

        {sheet}
        {/* What a colleague moves, adds or writes shows up here too, the way it does in Trello. */}
        <LiveRefresh url="/api/board-version" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <StickyHead>
        <div className={pageToolbar}>
          <h1 className={pageTitle}>{t('title')}</h1>
          {/* The same right-hand end as the board's bar, in the same order:
              the year, list or board, the new project, and the office's doors
              — drafts, templates, checklists, forms — behind the three dots.
              The switch used to sit a card lower, at the end of the status
              tabs, and was looked for up here and not found. The row wraps on
              a phone instead of running off its right edge. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {viewSwitch}
            {/* Templates and new projects are the office's; a site manager adds a card on the board. */}
            {isOffice(user) && (
              <Link href="/projects/new" className={btn.primary}>
                {t('newProject')}
              </Link>
            )}
            {officeLinks.length > 0 && <ListMenu links={officeLinks} />}
          </div>
        </div>
      </StickyHead>

      <PagePanel>
        {/*
          Two choices about the same projects: the status tabs say which are
          shown; which years, and list or board, is said in the page's bar
          above, where the board's bar says it too. Under the tabs the search
          and the filter, the way the board's bar has them.
        */}
        <div className="space-y-3 border-b border-border p-4">
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
          <div className="flex flex-wrap items-center gap-3">
            {search}
            {boardFilter}
          </div>
        </div>

          <div className="overflow-x-auto">
            <table className={`w-full table-fixed text-sm ${showPrice ? 'min-w-[1176px]' : 'min-w-[1016px]'}`}>
              <colgroup>
                <col className="w-28" />
                <col />
                <col className="w-[16%]" />
                <col className="w-40" />
                <col className="w-36" />
                {/* Wide enough for the status menu and the next step beside it. */}
                <col className="w-64" />
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
                        {p.doneAt && (
                          <Check className="mr-1 inline h-3.5 w-3.5 rounded-full bg-emerald-600 p-0.5 align-[-2px] text-white" strokeWidth={3} aria-label={t('cardDoneState')} />
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
                        {p.plannedStart ? formatDate(p.plannedStart, locale) : p.planMonth ? monthShort.format(p.planMonth) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {/* The badge is a menu, and beside it the usual next step is one click. */}
                        <ListStatus
                          projectId={p.id}
                          projectLabel={`${p.number} — ${p.name}`}
                          status={p.status}
                          next={nextStatus(p.status) ? { value: nextStatus(p.status)!, label: tStatus(nextStatus(p.status) as ProjectStatus) } : null}
                          options={STATUSES.map((s) => ({ value: s, label: tStatus(s) }))}
                          colorClass={STATUS_STYLES[p.status]}
                          confirmNext={nextStatus(p.status) === 'COMPLETED'}
                        />
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
      </PagePanel>

      <Pagination page={page} total={total} />

      {sheet}
      <LiveRefresh url="/api/board-version" />
    </div>
  )
}
