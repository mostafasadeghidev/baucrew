import Link from 'next/link'
import { Fragment } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { Columns3, List, MapPin, PlayCircle, Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { LiveSearchInput } from '@/components/live-search'
import { HeadDivider, PageBar, PageHint, PagePanel, StickyHead } from '@/components/ui/page-panel'
import { daysOut, deviceState } from '@/lib/devices'
import { formatDateTime, formatOfficeDate, officeDaysAgo } from '@/lib/format'
import { getLastSync } from '@/lib/wattro/sync'
import { isWattroConfigured } from '@/lib/wattro/client'
import { configuredSyncInterval } from '@/lib/wattro/auto-sync'
import {
  clusterByPosition,
  groupByHolder,
  LAST_SEEN_TRIGGERS,
  parseWhereFilter,
  readWattroDetails,
  whereKindOf,
  type DeviceWhereFilter,
  type HolderEntry,
  type PositionEntry,
} from '@/lib/wattro/details'
import { projectControl } from '../projects/toolbar-styles'
import { DevicesBoard, type BoardCard } from './devices-board'
import { DevicesMap, type MapSpot } from './devices-map'
import { RELATIVE_DAYS } from './wattro-device'
import { WattroSyncButton } from './wattro-sync-button'
import { PLACE_COLOURS, WhereIcon, whereName } from './wattro-where'

type DevicesView = 'board' | 'list' | 'map'

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; where?: string; view?: string }>
}) {
  await requireManagement()
  const [t, tc, locale, { q, where: whereParam, view }] = await Promise.all([
    getTranslations('devices'),
    getTranslations('common'),
    getLocale(),
    searchParams,
  ])
  const query = q?.trim() ?? ''
  const tab = parseWhereFilter(whereParam)
  const mode: DevicesView = view === 'board' || view === 'map' ? view : 'list'
  const board = mode === 'board'

  // Every device is read and narrowed here rather than in SQL: the search
  // reaches into what Wattro knows (brand, holder, site, tags), which lives
  // in a JSON column — and a few hundred machines are nothing to filter.
  const [allDevices, out, lastSync] = await Promise.all([
    db.device.findMany({
    include: {
      assignments: {
        where: { returnedAt: null },
        include: {
          project: { select: { id: true, number: true, name: true } },
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  }),

  // The devices that are not in the store — the "who has it?" question, on
  // the page that lists the devices themselves. It stood on the Lager page
  // first and was looked for here (QA of 25.09.). Never narrowed by the
  // search: what is out is out.
  db.deviceAssignment.findMany({
    where: { returnedAt: null },
    include: {
      device: { select: { id: true, name: true, inventoryNo: true } },
      project: { select: { id: true, number: true, name: true } },
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { takenAt: 'asc' },
  }),

  // When Wattro was last read — the freshness line under the page hint.
  getLastSync(),
  ])

  const now = new Date()
  const autoMinutes = configuredSyncInterval()
  const unknown = {
    unknownEmployee: (id: number) => t('unknownEmployee', { id }),
    unknownProject: (id: number) => t('unknownProject', { id }),
    unknownStore: (id: number) => t('unknownStore', { id }),
  }
  const rows = allDevices.map((device) => {
    const details = readWattroDetails(device.externalData)
    const handout = device.assignments[0] ?? null
    return { device, details, handout, kind: whereKindOf(details, handout) }
  })

  const needle = query.toLowerCase()
  const found = needle
    ? rows.filter(({ device, details }) =>
        [
          device.name,
          device.inventoryNo,
          device.category,
          device.storageLocation,
          details?.brand,
          details?.model,
          details?.serialNumber,
          details?.where && whereName(details.where, unknown),
          details?.where?.address,
          ...(details?.tags ?? []),
        ].some((field) => field?.toLowerCase().includes(needle))
      )
    : rows
  const counts: Record<DeviceWhereFilter, number> = { all: found.length, store: 0, employee: 0, project: 0 }
  for (const row of found) counts[row.kind]++
  const devices = tab === 'all' ? found : found.filter((row) => row.kind === tab)
  const hasWattro = rows.some((row) => row.details)

  // Tab, search and view travel together: switching one keeps the others.
  const href = ({ where = tab, as = mode }: { where?: DeviceWhereFilter; as?: DevicesView }) => {
    const params = new URLSearchParams()
    if (as !== 'list') params.set('view', as)
    if (where !== 'all') params.set('where', where)
    if (query) params.set('q', query)
    const qs = params.toString()
    return qs ? `/devices?${qs}` : '/devices'
  }
  const tabHref = (key: DeviceWhereFilter) => href({ where: key })

  // The board: every device in the list of the place it stands in.
  const columns = board
    ? groupByHolder<BoardCard>(
        devices.map(({ device, details, handout }): HolderEntry<BoardCard> => {
          const where = details?.where ?? null
          const state = deviceState(device.assignments)
          const make = [details?.brand, details?.model].filter(Boolean).join(' ')
          const card: BoardCard = {
            id: device.id,
            name: device.name,
            meta: [device.inventoryNo, make].filter(Boolean).join(' · '),
            since: null,
            inactive: !device.active,
          }
          // A hand-out made here, for a device of this app's own.
          if (handout && (state.status === 'onSite' || state.status === 'withEmployee')) {
            const kind = state.status === 'onSite' ? 'project' : 'employee'
            const key = state.status === 'onSite' ? `project:local:${state.projectId}` : `employee:local:${state.employeeId}`
            card.since = t('whereSince', { date: formatOfficeDate(handout.takenAt, locale) })
            return { item: card, kind, key, label: state.label, sub: null, finished: false, name: device.name, since: handout.takenAt.toISOString() }
          }
          if (where) {
            if (where.kind !== 'store' && where.since) card.since = t('whereSince', { date: formatOfficeDate(new Date(where.since), locale) })
            return {
              item: card,
              kind: where.kind,
              key: `${where.kind}:${where.id}`,
              label: whereName(where, unknown),
              sub: where.kind === 'project' ? where.address : null,
              finished: where.finished,
              name: device.name,
              since: where.since,
            }
          }
          // Wattro tracks it but places it nowhere: not "in the store" — its own list.
          if (details) {
            return { item: card, kind: 'store', key: 'store:unassigned', label: t('wattroUnassigned'), sub: null, finished: false, name: device.name, since: null }
          }
          return { item: card, kind: 'store', key: 'store:local', label: t('store'), sub: null, finished: false, name: device.name, since: null }
        })
      )
    : []

  // The map: one pin per spot where Wattro last saw machines.
  const unplaced: Array<{ id: string; name: string; meta: string }> = []
  const spots: MapSpot[] =
    mode === 'map'
      ? clusterByPosition(
          devices.flatMap(({ device, details }): PositionEntry<MapSpot['devices'][number]>[] => {
            const make = [details?.brand, details?.model].filter(Boolean).join(' ')
            const item = { id: device.id, name: device.name, meta: [device.inventoryNo, make].filter(Boolean).join(' · ') }
            const position = details?.position
            if (!position) {
              unplaced.push(item)
              return []
            }
            const where = details.where
            return [
              {
                item,
                lat: position.lat,
                lng: position.lng,
                kind: where?.kind ?? 'store',
                label: where ? whereName(where, unknown) : t('wattroUnassigned'),
              },
            ]
          })
        ).map(({ items, ...spot }) => ({ ...spot, devices: items }))
      : []
  // The places first, each with its colour as on the pins and icons; "all"
  // after them, as "all projects" stands after the boards.
  const tabs: Array<{ key: DeviceWhereFilter; label: string; swatch: string | null }> = [
    { key: 'store', label: t('tabStore'), swatch: PLACE_COLOURS.store },
    { key: 'employee', label: t('tabEmployee'), swatch: PLACE_COLOURS.employee },
    { key: 'project', label: t('tabProject'), swatch: PLACE_COLOURS.project },
    { key: 'all', label: t('tabAllDevices'), swatch: null },
  ]
  const views: Array<{ key: DevicesView; label: string; Icon: typeof List }> = [
    { key: 'board', label: t('viewBoard'), Icon: Columns3 },
    { key: 'list', label: t('viewList'), Icon: List },
    { key: 'map', label: t('viewMap'), Icon: MapPin },
  ]
  const triggers = new Set<string>(LAST_SEEN_TRIGGERS)

  return (
    <div className="space-y-4">
      <StickyHead>
        {/* Drawn like the projects head: the name, the places as quiet pills
            with their colour as a dot, "all" after a hairline, then the
            three views — board, list, map — and on the right the one thing
            to do. */}
        <PageBar
          title={t('title')}
          tabs={
            <div className="flex min-w-0 items-center gap-3">
              <nav aria-label={t('whereTabs')} className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tabs.map(({ key, label, swatch }) => (
                  <Fragment key={key}>
                    {key === 'all' && <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />}
                    <Link
                      href={tabHref(key)}
                      replace
                      aria-current={tab === key ? 'page' : undefined}
                      className={`${projectControl.boardTab} ${tab === key ? projectControl.boardTabOn : projectControl.boardTabOff}`}
                    >
                      {swatch && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: swatch }} />}
                      <span className="truncate">{label}</span>
                      <span className="text-xs tabular-nums text-muted">{counts[key]}</span>
                    </Link>
                  </Fragment>
                ))}
              </nav>
              <HeadDivider />
              <nav aria-label={t('viewSwitch')} className={projectControl.viewGroup}>
                {views.map(({ key, label, Icon }) => (
                  <Link
                    key={key}
                    href={href({ as: key })}
                    title={label}
                    aria-current={mode === key ? 'page' : undefined}
                    className={`${projectControl.viewButton} ${mode === key ? projectControl.viewOn : projectControl.viewOff}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{label}</span>
                  </Link>
                ))}
              </nav>
            </div>
          }
          actions={
            <Link href="/devices/new" className={projectControl.primary}>
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t('newDevice')}</span>
              <span className="sr-only sm:hidden">{t('newDevice')}</span>
            </Link>
          }
        />
      </StickyHead>
      <PageHint>{t('hint')}</PageHint>

      {/* The Wattro line: how fresh the list is, and the one control that reads Wattro */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3">
        <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-muted">
          {t('wattroBadge')}
        </span>
        <span className="text-sm text-muted">
          {lastSync.at
            ? t('wattroLastSync', { time: formatDateTime(lastSync.at, locale) })
            : t('wattroNever')}
          {autoMinutes > 0 && isWattroConfigured() && <> · {t('wattroAuto', { minutes: autoMinutes })}</>}
        </span>
        <div className="ml-auto">
          <WattroSyncButton configured={isWattroConfigured()} />
        </div>
      </div>

      {/* Devices handed out in this app — who has what, longest out first.
          With Wattro tracking the machines, an empty list here would read
          as "everything is in the store", which Wattro may well contradict;
          the tabs above answer that, so the section shows only what it has. */}
      {(out.length > 0 || !hasWattro) && (
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('outTitle')}</h2>
          <p className="text-xs text-muted">{t('outHint')}</p>
        </div>
        {out.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('allInStore')}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {out.map((handout) => (
              <li key={handout.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <Link href={`/devices/${handout.device.id}`} className="font-medium text-accent hover:underline">
                  {handout.device.name}
                </Link>
                {handout.device.inventoryNo && (
                  <span className="text-xs tabular-nums text-muted">{handout.device.inventoryNo}</span>
                )}
                <span className="min-w-0 flex-1 truncate text-red-700 dark:text-red-400">
                  ●{' '}
                  {handout.project ? (
                    <Link href={`/projects/${handout.project.id}`} className="hover:underline">
                      {handout.project.number} — {handout.project.name}
                    </Link>
                  ) : handout.employee ? (
                    <Link href={`/employees/${handout.employee.id}`} className="hover:underline">
                      {`${handout.employee.firstName} ${handout.employee.lastName}`.trim()}
                    </Link>
                  ) : (
                    t('out')
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted">{t('sinceDays', { days: daysOut(handout.takenAt, new Date()) })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {mode === 'map' ? (
        <>
          <div className="flex w-full max-w-xl">
            <LiveSearchInput param="q" placeholder={t('searchPlaceholder')} />
          </div>
          <DevicesMap spots={spots} unplaced={unplaced} emptyLabel={query ? t('noResults') : t('noneInTab')} />
        </>
      ) : board ? (
        <>
          <div className="flex w-full max-w-xl">
            <LiveSearchInput param="q" placeholder={t('searchPlaceholder')} />
          </div>
          <DevicesBoard
            columns={columns}
            labels={{
              kind: { store: t('whereStore'), employee: t('whereEmployee'), project: t('whereProject') },
              finished: t('projectFinished'),
              finishedHint: t('projectFinishedHint'),
              inactive: tc('inactive'),
              empty: query ? t('noResults') : t('noneInTab'),
            }}
          />
        </>
      ) : (
      <PagePanel>
        <div className="flex border-b border-border p-4">
          <div className="flex w-full max-w-xl">
            <LiveSearchInput param="q" placeholder={t('searchPlaceholder')} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-36" />
              <col className="w-[34%]" />
              <col className="w-40" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">{t('name')}</th>
                <th className="px-4 py-3 font-medium">{t('inventoryNo')}</th>
                <th className="px-4 py-3 font-medium">{t('whereNow')}</th>
                <th className="px-4 py-3 font-medium">{t('lastSeen')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    {query ? t('noResults') : rows.length === 0 ? t('none') : t('noneInTab')}
                  </td>
                </tr>
              ) : (
                devices.map(({ device, details, handout }) => {
                  const state = deviceState(device.assignments)
                  const make = [details?.brand, details?.model].filter(Boolean).join(' ')
                  const subline = [make, device.category].filter(Boolean).join(' · ')
                  const where = details?.where ?? null
                  const seen = details?.lastSeen ?? null
                  return (
                    <tr key={device.id} className="hover:bg-surface-hover">
                      <td className="break-words px-4 py-3 align-top">
                        <Link
                          href={`/devices/${device.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {device.name}
                        </Link>
                        {device.videoUrl && (
                          <PlayCircle className="ml-1 inline h-4 w-4 text-muted" aria-label={t('video')} />
                        )}
                        {!device.active && (
                          <span className="ml-2 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">
                            {tc('inactive')}
                          </span>
                        )}
                        {subline && <p className="truncate text-xs text-muted">{subline}</p>}
                      </td>
                      <td
                        className="truncate px-4 py-3 align-top tabular-nums text-muted"
                        title={device.inventoryNo ?? undefined}
                      >
                        {device.inventoryNo ?? '—'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {where ? (
                          <>
                            <p className="flex min-w-0 items-center gap-1.5">
                              <WhereIcon
                                kind={where.kind}
                                label={t(where.kind === 'store' ? 'whereStore' : where.kind === 'employee' ? 'whereEmployee' : 'whereProject')}
                              />
                              <span className="truncate" title={where.address ?? undefined}>
                                {whereName(where, unknown)}
                              </span>
                            </p>
                            <p className="truncate pl-[22px] text-xs text-muted">
                              {where.kind === 'store'
                                ? (device.storageLocation ??
                                  (where.since && t('whereSince', { date: formatOfficeDate(new Date(where.since), locale) })))
                                : where.since && t('whereSince', { date: formatOfficeDate(new Date(where.since), locale) })}
                              {where.finished && (
                                <span className="text-amber-700 dark:text-amber-400" title={t('projectFinishedHint')}>
                                  {where.since ? ' · ' : ''}
                                  {t('projectFinished')}
                                </span>
                              )}
                            </p>
                          </>
                        ) : details && state.status === 'free' ? (
                          <p className="text-muted">{t('wattroUnassigned')}</p>
                        ) : state.status === 'free' ? (
                          <>
                            <p className="flex items-center gap-1.5">
                              <WhereIcon kind="store" label={t('whereStore')} />
                              {t('free')}
                            </p>
                            {device.storageLocation && (
                              <p className="truncate pl-[22px] text-xs text-muted">{device.storageLocation}</p>
                            )}
                          </>
                        ) : null}
                        {handout && state.status !== 'free' && (
                          <p className={`flex min-w-0 items-center gap-1.5 ${where ? 'mt-1 text-xs text-muted' : ''}`}>
                            {!where && (
                              <WhereIcon
                                kind={state.status === 'withEmployee' ? 'employee' : 'project'}
                                label={t(state.status === 'withEmployee' ? 'whereEmployee' : 'whereProject')}
                              />
                            )}
                            <span className="truncate">
                              {where ? t('handoutHere', { who: state.label || t('out') }) : null}
                              {!where &&
                                (state.status === 'onSite' ? (
                                  <Link href={`/projects/${state.projectId}`} className="hover:underline">
                                    {state.label}
                                  </Link>
                                ) : state.status === 'withEmployee' ? (
                                  <Link href={`/employees/${state.employeeId}`} className="hover:underline">
                                    {state.label}
                                  </Link>
                                ) : (
                                  t('out')
                                ))}
                            </span>
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {seen ? (
                          <>
                            <p title={formatDateTime(new Date(seen.at), locale)}>
                              {/* "vor 12 Tagen" reads at a glance; "vor 420 Tagen" does not — past a month, the date. */}
                              {officeDaysAgo(new Date(seen.at), now) <= RELATIVE_DAYS
                                ? t('seenDaysAgo', { days: officeDaysAgo(new Date(seen.at), now) })
                                : formatOfficeDate(new Date(seen.at), locale)}
                            </p>
                            {seen.trigger && (
                              <p className="truncate text-xs text-muted">
                                {triggers.has(seen.trigger) ? t(`triggers.${seen.trigger}` as 'triggers.SCAN_EPC') : seen.trigger}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>
      )}
    </div>
  )
}
