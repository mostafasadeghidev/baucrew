/**
 * The CRM's Heute tab: where to look today.
 *
 * The office reads its company as a handful of parts, each one number with a
 * lamp, and it grades what is stuck higher than what is big. So the tab is the
 * lamps, and a click on one opens what stands behind it right under them — all
 * the lines of this month, every job that is late, who is out today. A sheet
 * lists everything its tile counts, never a first few: a list that stops at
 * eight reads as if there were eight. The long lists
 * (every job by stage, the site table, the material) are their own tab,
 * "Aufträge & Baustellen" (jobs-view.tsx); each sheet here links to them.
 *
 * Everything here is "Stand heute": it does not follow the year and period
 * pickers, and the page bar says so. Old data — work finished before the
 * history cutoff — never shows in a lamp or a list. Every figure is derived
 * from what is already entered, and no lamp is ever set by hand.
 */

import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ProjectStatus } from '@/generated/prisma/enums'
import { StatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/format'
import { isWorkday, lampAbove, SOON_DAYS, todayCrewLamp } from '@/lib/cockpit'
import type { GapReport } from '@/lib/data-gaps'
import { CLASSES, type OpenMoney, type OpenMoneyRow, type PlanClass } from '@/lib/order-situation'
import { STALE_OFFER_DAYS, type Today, type TodayJob } from '@/lib/reports'
import { MaterialLists, NextVisit, currentJobs } from './jobs-view'
import { TileBoard, type BoardTile, type TileLamp } from './tile-board'

const label = 'text-[11px] uppercase tracking-wide text-muted'
const stat = 'rounded-lg border border-border bg-subtle/40 px-3 py-2'
const warn = 'text-amber-700 dark:text-amber-400'
const danger = 'text-red-700 dark:text-red-400'

/** The same swatches as the month bars of the Planumsatz tab. Literal, so Tailwind finds them. */
const CLASS_FILL: Record<PlanClass, string> = {
  finished: 'bg-emerald-600',
  ordered: 'bg-accent',
  offered: 'bg-accent/35',
  sheet: 'border border-dashed border-muted',
}
const CLASS_LABEL = {
  finished: 'classFinished',
  ordered: 'certaintyOrdered',
  offered: 'certaintyOffered',
  sheet: 'classSheet',
} as const

export type MonthPlanLine = { key: string; id: string | null; name: string; customer: string; amount: number | null; cls: PlanClass }

export async function TodayView({
  data,
  money,
  showFinancials,
  locale,
  today,
  monthPlan,
  backlog,
  usualCrew,
  gaps,
  cutoff,
}: {
  data: Today
  /** Null where the reader may not see money. */
  money: OpenMoney | null
  showFinancials: boolean
  locale: string
  today: Date
  /** The running month's Planumsatz; null without money rights. */
  monthPlan: {
    label: string
    total: number
    average: number | null
    lastYear: { year: number; total: number } | null
    classes: Record<PlanClass, number>
    lines: MonthPlanLine[]
  } | null
  /** Ordered work of the next twelve months, month by month with its jobs; null without money rights. */
  backlog: {
    label: string
    amount: number
    weeks: number | null
    months: Array<{
      label: string
      amount: number
      lines: Array<{ key: string; id: string; number: string; name: string; customer: string; amount: number | null }>
    }>
  } | null
  /** People on an ordinary working day of the last three months, to hold today's crew against; null without one. */
  usualCrew: number | null
  gaps: GapReport
  cutoff: Date | null
}) {
  const t = await getTranslations('reports')
  const whole = (v: number) => formatCurrency(v, locale, { whole: true })
  const date = (d: Date) => formatDate(d, locale)
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  const current = currentJobs(data)
  const offers = current
    .filter((j) => j.status === 'LEAD' || j.status === 'QUOTED')
    .sort((a, b) => b.ageDays - a.ageDays)
  const toChase = offers.filter((j) => j.ageDays >= STALE_OFFER_DAYS).length
  const overdue = current
    .filter((j) => j.group === 'overdue')
    .sort((a, b) => (b.overdue?.workdaysLate ?? 0) - (a.overdue?.workdaysLate ?? 0))
  const withMaterialMissing = current.filter(
    (j) => j.missingItems > 0 && (j.status === 'APPROVED' || j.status === 'PLANNED' || j.status === 'IN_PROGRESS')
  )
  const sum = (jobs: TodayJob[]) => jobs.reduce((a, j) => a + (j.amount ?? 0), 0)
  const withoutValue = (jobs: TodayJob[]) => jobs.filter((j) => j.amount === null).length
  const moneyRows = money ? [...money.done.rows, ...money.invoiced.rows] : []
  const moneyWithoutValue = moneyRows.filter((r) => r.amount === null).length
  const outstanding = money ? money.done.total + money.invoiced.total : 0

  const planLamp: TileLamp =
    !monthPlan || monthPlan.average === null
      ? 'none'
      : monthPlan.total >= monthPlan.average
        ? 'green'
        : monthPlan.total >= monthPlan.average / 2
          ? 'yellow'
          : 'red'
  const backlogLamp: TileLamp =
    !backlog || backlog.weeks === null ? 'none' : backlog.weeks < 4 ? 'red' : backlog.weeks < 8 ? 'yellow' : 'green'
  const moneyLamp: TileLamp =
    outstanding >= 100_000 ? 'red' : outstanding > 0 || moneyWithoutValue > 0 ? 'yellow' : 'green'
  const offersLamp: TileLamp = offers.length === 0 ? 'none' : toChase > 0 ? 'yellow' : 'green'
  const crewToday = { date: today, people: data.schedule.people }
  const teamLamp: TileLamp = todayCrewLamp(crewToday, usualCrew)
  /** "7 Personen"; on a weekend nobody works, only that it is the weekend. */
  const peopleToday =
    crewToday.people > 0
      ? t('teamPeople', { count: crewToday.people })
      : isWorkday(crewToday)
        ? t('tileTeamNone')
        : t('teamWeekend')
  const teamUsual = usualCrew !== null ? t('teamUsual', { count: usualCrew }) : null

  // ── Pieces the sheets share ─────────────────────────────────
  const amount = (value: number | null) =>
    showFinancials ? (
      <span className="block tabular-nums">{value === null ? <span className={warn}>{t('valueMissing')}</span> : whole(value)}</span>
    ) : null
  const jobName = (job: { id: string; number: string; name: string; customer?: string }) => (
    <span className="min-w-0">
      <Link href={`/projects/${job.id}`} className="block truncate text-accent hover:underline">
        {job.number} — {job.name}
      </Link>
      {job.customer && <span className="block truncate text-[11px] text-muted">{job.customer}</span>}
    </span>
  )
  const empty = (text: string) => <p className="text-[13px] text-muted">{text}</p>
  const row = 'flex items-center justify-between gap-3 py-1.5 text-[13px]'

  // ── The sheets ──────────────────────────────────────────────
  const planPanel = monthPlan && (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={stat}>
          <p className={label}>{t('panelThisMonth')}</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">{whole(monthPlan.total)}</p>
        </div>
        <div className={stat}>
          <p className={label}>{t('situationAverage')}</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">
            {monthPlan.average === null ? '—' : whole(monthPlan.average)}
          </p>
        </div>
        <div className={stat}>
          <p className={label}>{t('situationLastYear', { year: monthPlan.lastYear?.year ?? today.getUTCFullYear() - 1 })}</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">
            {monthPlan.lastYear === null ? '—' : whole(monthPlan.lastYear.total)}
          </p>
        </div>
      </div>
      {monthPlan.lines.length === 0 ? (
        empty(t('noRevenueInPeriod'))
      ) : (
        // One card per state of the money, surest first: its total on top, then
        // the month's lines in that state, the biggest first.
        <ul className="grid gap-3 sm:grid-cols-2">
          {CLASSES.map((cls) => {
            const lines = monthPlan.lines.filter((line) => line.cls === cls)
            return (
              <li key={cls} className="overflow-hidden rounded-lg border border-border bg-subtle/40">
                <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${CLASS_FILL[cls]}`} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{t(CLASS_LABEL[cls])}</p>
                      <p className="text-[11px] text-muted">{t('panelPlanLines', { count: lines.length })}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums">{whole(monthPlan.classes[cls])}</span>
                </div>
                {lines.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-muted">{t('panelPlanClassEmpty')}</p>
                ) : (
                  <ul className="divide-y divide-border px-3">
                    {lines.map((line) => (
                      <li key={line.key} className="flex items-start justify-between gap-3 py-1.5 text-[13px]">
                        <span className="min-w-0">
                          {line.id ? (
                            <Link
                              href={`/projects/${line.id}`}
                              title={line.name}
                              className="block truncate text-accent hover:underline"
                            >
                              {line.name}
                            </Link>
                          ) : (
                            <span className="block truncate" title={line.name}>
                              {line.name}
                            </span>
                          )}
                          {line.customer && <span className="block truncate text-[11px] text-muted">{line.customer}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums">{line.amount === null ? '—' : whole(line.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  const backlogPanel = backlog && (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">{t('panelBacklogHint')}</p>
      <p className="text-[13px]">
        <span className="font-semibold tabular-nums">{whole(backlog.amount)}</span>
        {backlog.weeks !== null && <span className="text-muted"> · {t('situationWeeks', { count: backlog.weeks })}</span>}
      </p>
      {/* One card per month: its ordered work on top, then the jobs it is made of, the biggest first. */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {backlog.months.map((month) => (
          <li key={month.label} className="overflow-hidden rounded-lg border border-border bg-subtle/40">
            <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{month.label}</p>
                {/* A job with two lines in one month is one job. */}
                <p className="text-[11px] text-muted">
                  {t('panelBacklogJobs', { count: new Set(month.lines.map((line) => line.id)).size })}
                </p>
              </div>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                {month.amount > 0 ? whole(month.amount) : '—'}
              </span>
            </div>
            {month.lines.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-muted">{t('panelBacklogEmpty')}</p>
            ) : (
              <ul className="divide-y divide-border px-3">
                {month.lines.map((line) => (
                  <li key={line.key} className="flex items-start justify-between gap-3 py-1.5 text-[13px]">
                    <span className="min-w-0">
                      <Link href={`/projects/${line.id}`} title={line.name} className="block truncate text-accent hover:underline">
                        {line.name}
                      </Link>
                      <span className="block truncate text-[11px] text-muted">
                        {[line.number, line.customer].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{line.amount === null ? '—' : whole(line.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )

  const moneyList = (title: string, list: { total: number; rows: OpenMoneyRow[] }) => (
    <div>
      <h3 className={`flex items-baseline justify-between gap-2 ${label}`}>
        <span>{title}</span>
        <span className="tabular-nums">{whole(list.total)}</span>
      </h3>
      {list.rows.length === 0 ? (
        empty(t('situationMoneyNone'))
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {list.rows.map((r) => (
            <li key={r.id} className={row}>
              {jobName(r)}
              <span className="shrink-0 text-right">
                {r.since && <span className="block text-[11px] text-muted">{t('situationMoneySince', { date: date(r.since) })}</span>}
                {amount(r.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  const moneyPanel = money && (
    <div className="grid gap-6 md:grid-cols-2">
      {moneyList(t('listDone'), money.done)}
      {moneyList(t('listInvoiced'), money.invoiced)}
    </div>
  )

  const offersPanel =
    offers.length === 0 ? (
      empty(t('panelOffersNone'))
    ) : (
      <div>
        <ul className="divide-y divide-border">
          {offers.map((job) => {
            const started = job.plannedStart !== null && job.plannedStart.getTime() < day
            return (
              <li key={job.id} className={row}>
                <span className="flex min-w-0 items-center gap-2">
                  {/* Enquiry or offer: the dashboard counts offers alone. */}
                  <StatusBadge status={job.status as ProjectStatus} />
                  {jobName(job)}
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-[11px] ${job.ageDays >= STALE_OFFER_DAYS || started ? warn : 'text-muted'}`}>
                    {[t('waitingSince', { count: job.ageDays }), started ? t('startPassed') : null].filter(Boolean).join(' · ')}
                  </span>
                  {amount(job.amount)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    )

  const overduePanel =
    overdue.length === 0 ? (
      empty(t('cockpitNothingStuck'))
    ) : (
      <div>
        <ul className="divide-y divide-border">
          {overdue.map((job) => (
            <li key={job.id} className="grid gap-x-4 gap-y-1 py-1.5 text-[13px] sm:grid-cols-[minmax(0,1fr)_14rem_9rem_7rem]">
              {jobName(job)}
              <span className="text-[11px]">
                <span className={`block ${danger}`}>
                  {job.overdue?.reason === 'end'
                    ? t('lateEnd', { count: job.overdue.workdaysLate })
                    : t('lateStart', { count: job.overdue?.workdaysLate ?? 0 })}
                </span>
                <span className="block tabular-nums text-muted">
                  {job.plannedStart
                    ? `${date(job.plannedStart)}${job.plannedEnd ? ` – ${date(job.plannedEnd)}` : ''}`
                    : job.plannedEnd
                      ? t('periodUntil', { date: date(job.plannedEnd) })
                      : '—'}
                </span>
              </span>
              <span className="text-[11px]">
                <NextVisit
                  job={job}
                  day={day}
                  locale={locale}
                  labels={{ none: t('noVisit14', { days: SOON_DAYS }), later: (d) => t('nextVisitLater', { date: d }) }}
                />
              </span>
              <span className="sm:text-right">{amount(job.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    )

  const teamPanel = (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={stat}>
          <p className={label}>{t('panelTeamPeople')}</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">{peopleToday}</p>
          {teamUsual && <p className="text-[11px] text-muted">{teamUsual}</p>}
        </div>
        <div className={stat}>
          <p className={label}>{t('panelTeamSites')}</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">{data.schedule.today.length}</p>
        </div>
      </div>
      <div>
        <h3 className={label}>{t('panelTeamToday')}</h3>
        {data.schedule.today.length === 0 ? (
          empty(t('panelTeamTodayNone'))
        ) : (
          // One card per site: the site on top, then its people one under the other.
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.schedule.today.map((site) => (
              <li key={site.projectId} className="overflow-hidden rounded-lg border border-border bg-subtle/40">
                <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[11px] tabular-nums text-muted">{site.number}</p>
                    <Link
                      href={`/projects/${site.projectId}`}
                      title={site.name}
                      className="block truncate text-[13px] font-medium text-accent hover:underline"
                    >
                      {site.name}
                    </Link>
                  </div>
                  <span className="mt-0.5 shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent">
                    {t('teamPeople', { count: site.people.length })}
                  </span>
                </div>
                <ul className="space-y-1 px-3 py-2 text-[13px]">
                  {site.people.map((person) => (
                    <li key={person.id} className="truncate">
                      {person.name || '—'}
                    </li>
                  ))}
                  {/* Booked but away today: named, not counted. */}
                  {site.away.map((person) => (
                    <li key={person.id} className={`truncate ${warn}`}>
                      {person.name || '—'} <span className="text-[11px]">· {t('panelTeamAwayOne')}</span>
                    </li>
                  ))}
                  {site.people.length === 0 && site.away.length === 0 && <li className="text-muted">—</li>}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  const gapCards = [
    { id: 'wert-termin', title: t('gapValueOrDate'), count: gaps.valueOrDate.length },
    { id: 'wert-plan', title: t('gapValueVsPlan'), count: gaps.valueVsPlan.length },
    { id: 'sub', title: t('gapSub'), count: gaps.subConflict.length },
    { id: 'nicht-geplant', title: t('gapNotInPlan'), count: gaps.notInPlan.length },
    { id: 'planzeilen', title: t('gapLooseLines'), count: gaps.looseLines.length },
  ]
  const gapsPanel = (
    <div>
      <ul className="divide-y divide-border">
        {gapCards.map((gap) => (
          <li key={gap.id} className={row}>
            <Link href={`/reports?tab=quality#${gap.id}`} className="min-w-0 truncate text-accent hover:underline">
              {gap.title}
            </Link>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                gap.count === 0
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
              }`}
            >
              {gap.count}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border pt-2 text-[13px]">
        <span className="font-semibold tabular-nums">{gaps.count}</span>{' '}
        <span className="text-muted">{t('panelGapsTotal')}</span>
      </p>
      {gaps.historicalWithGaps > 0 && (
        <p className="pt-2 text-[11px] text-muted">
          {t('gapHistorical', { count: gaps.historicalWithGaps, date: cutoff ? date(cutoff) : '—' })}
        </p>
      )}
    </div>
  )

  // ── The tiles ───────────────────────────────────────────────
  const toJobs = (anchor: string, openRows?: string) => ({
    href: `/reports?tab=jobs${openRows ? `&open=${openRows}` : ''}#${anchor}`,
    label: t('panelMoreJobs'),
  })
  const tiles: BoardTile[] = [
    ...(monthPlan
      ? [
          {
            key: 'plan',
            label: t('tileMonthPlan', { month: monthPlan.label }),
            value: whole(monthPlan.total),
            caption: monthPlan.average !== null ? t('tileMonthPlanAvg', { amount: whole(monthPlan.average) }) : null,
            lamp: planLamp,
            panel: planPanel,
            more: { href: '/reports?tab=revenue', label: t('panelMorePlan') },
          },
        ]
      : []),
    ...(backlog
      ? [
          {
            key: 'backlog',
            label: t('situationBacklog', { month: backlog.label }),
            value: whole(backlog.amount),
            caption: backlog.weeks !== null ? t('situationWeeks', { count: backlog.weeks }) : null,
            lamp: backlogLamp,
            panel: backlogPanel,
            more: { href: '/reports?tab=revenue', label: t('panelMorePlan') },
          },
        ]
      : []),
    ...(money
      ? [
          {
            key: 'money',
            label: t('situationMoney'),
            value: whole(outstanding),
            caption: [
              t('tileMoneyCaption', { done: whole(money.done.total), invoiced: whole(money.invoiced.total) }),
              moneyWithoutValue > 0 ? t('withoutValue', { count: moneyWithoutValue }) : null,
            ]
              .filter(Boolean)
              .join(' · '),
            lamp: moneyLamp,
            panel: moneyPanel,
            more: toJobs('stand', 'money'),
          },
        ]
      : []),
    {
      key: 'offers',
      label: t('areaSales'),
      value: String(offers.length),
      caption:
        [
          showFinancials && offers.length > 0 ? whole(sum(offers)) : null,
          toChase > 0 ? t('tileOffersCaption', { count: toChase }) : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      lamp: offersLamp,
      panel: offersPanel,
      more: toJobs('stand', 'offers'),
    },
    {
      key: 'overdue',
      label: t('groupOverdue'),
      value: String(overdue.length),
      caption:
        [
          showFinancials && overdue.length > 0 ? whole(sum(overdue)) : null,
          withoutValue(overdue) > 0 ? t('withoutValue', { count: withoutValue(overdue) }) : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      lamp: lampAbove(overdue.length, 1, 5),
      panel: overduePanel,
      more: toJobs('baustellen'),
    },
    {
      key: 'team',
      label: t('tileTeamToday'),
      value: peopleToday,
      caption: teamUsual,
      lamp: teamLamp,
      panel: teamPanel,
      more: { href: '/reports?tab=utilization', label: t('panelMoreUsage') },
    },
    {
      key: 'material',
      label: t('areaMaterial'),
      value: String(withMaterialMissing.length),
      caption: t('tileMaterialCaption', {
        items: withMaterialMissing.reduce((a, j) => a + j.missingItems, 0),
        short: data.stockShort.length,
      }),
      lamp: lampAbove(withMaterialMissing.length, 1, 5),
      panel: <MaterialLists data={data} />,
      more: toJobs('material'),
    },
    {
      key: 'gaps',
      label: t('areaGaps'),
      value: String(gaps.count),
      caption: t('tileGapsCaption'),
      lamp: lampAbove(gaps.count, 1, 30),
      panel: gapsPanel,
      more: { href: '/reports?tab=quality', label: t('panelMoreGaps') },
    },
  ]

  return <TileBoard tiles={tiles} closeLabel={t('panelClose')} />
}
