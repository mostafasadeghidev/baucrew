/**
 * The CRM's Heute tab: where to look today.
 *
 * The office reads its company as a handful of parts, each one number with a
 * lamp, and it grades what is stuck higher than what is big. So the lamps come
 * first; under them every job that still matters, by the stage it stands in;
 * then one table of the sites — late, running, starting soon — in which every
 * job appears once; then the material that is missing.
 *
 * Everything here is "Stand heute": it does not follow the year and period
 * pickers, and the page bar says so. Old data — work finished before the
 * history cutoff — never shows in a lamp or a list; where it is left out, a
 * footnote counts it. Every figure is derived from what is already entered,
 * and no lamp is ever set by hand.
 */

import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ProjectStatus } from '@/generated/prisma/enums'
import { StatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/format'
import { lampAbove, siteProgress, SOON_DAYS, type Lamp, type Stage } from '@/lib/cockpit'
import type { OpenMoney } from '@/lib/order-situation'
import { STALE_OFFER_DAYS, type Today, type TodayJob } from '@/lib/reports'

const card = 'rounded-xl border border-border bg-surface shadow-sm'
const kpi = 'block rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm'
const kpiLabel = 'text-[11px] uppercase tracking-wide text-muted'
const kpiValue = 'mt-0.5 text-lg font-semibold tabular-nums'
const kpiSub = 'mt-0.5 text-[11px] text-muted'
const th = 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted'
const thR = `${th} text-right`
const td = 'px-3 py-1.5 align-top'
const tdR = `${td} text-right tabular-nums`
const warn = 'text-amber-700 dark:text-amber-400'
const danger = 'text-red-700 dark:text-red-400'

const LAMP: Record<Lamp, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  none: 'bg-border',
}

const DAY = 86_400_000

/** Which stage rows a `?open=` value unfolds — the old offers tab, a tile, a link. */
const OPENS: Record<string, readonly Stage[]> = {
  offers: ['LEAD', 'QUOTED'],
  ordered: ['APPROVED', 'PLANNED', 'IN_PROGRESS'],
  money: ['COMPLETED', 'INVOICED'],
}

export async function TodayView({
  data,
  money,
  showFinancials,
  locale,
  today,
  open,
  monthPlan,
  backlog,
  crew,
  gapCount,
  cutoff,
}: {
  data: Today
  /** Null where the reader may not see money. */
  money: OpenMoney | null
  showFinancials: boolean
  locale: string
  today: Date
  /** Stage rows to unfold, from `?open=`. */
  open: string | undefined
  /** The running month's Planumsatz against an ordinary month; null without money rights. */
  monthPlan: { label: string; total: number; average: number | null } | null
  /** Ordered work of the next twelve months; null without money rights. */
  backlog: { label: string; amount: number; weeks: number | null } | null
  /** The crew's planned share of the running month. */
  crew: { label: string; pct: number | null; booked: number }
  gapCount: number
  cutoff: Date | null
}) {
  const t = await getTranslations('reports')
  const whole = (v: number) => formatCurrency(v, locale, { whole: true })
  const date = (d: Date) => formatDate(d, locale)
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  const current = data.jobs.filter((j) => !j.historical && j.status !== 'CANCELLED')
  const offers = current.filter((j) => j.status === 'LEAD' || j.status === 'QUOTED')
  const toChase = offers.filter((j) => j.ageDays >= STALE_OFFER_DAYS).length
  const overdue = current.filter((j) => j.group === 'overdue')
  const running = current.filter((j) => j.group === 'running')
  const starting = current.filter((j) => j.group === 'starting')
  const withMaterialMissing = current.filter(
    (j) => j.missingItems > 0 && (j.status === 'APPROVED' || j.status === 'PLANNED' || j.status === 'IN_PROGRESS')
  )
  const sum = (jobs: TodayJob[]) => jobs.reduce((a, j) => a + (j.amount ?? 0), 0)
  const withoutValue = (jobs: TodayJob[]) => jobs.filter((j) => j.amount === null).length
  const moneyRows = money ? [...money.done.rows, ...money.invoiced.rows] : []
  const moneyWithoutValue = moneyRows.filter((r) => r.amount === null).length
  const outstanding = money ? money.done.total + money.invoiced.total : 0
  const opened = new Set(OPENS[open ?? ''] ?? [])
  const since = new Map(moneyRows.map((r) => [r.id, r.since]))

  const tile = ({
    key,
    label,
    value,
    caption,
    lamp,
    href,
  }: {
    key: string
    label: string
    value: string
    caption?: string | null
    lamp: Lamp
    href: string
  }) => (
    <Link key={key} href={href} className={`${kpi} transition-colors hover:bg-surface-hover`}>
      <div className="flex items-start justify-between gap-2">
        <span className={kpiLabel}>{label}</span>
        <span aria-hidden className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${LAMP[lamp]}`} />
      </div>
      <div className={kpiValue}>{value}</div>
      <div className={kpiSub}>{caption ?? ''}</div>
    </Link>
  )

  const planLamp: Lamp =
    !monthPlan || monthPlan.average === null
      ? 'none'
      : monthPlan.total >= monthPlan.average
        ? 'green'
        : monthPlan.total >= monthPlan.average / 2
          ? 'yellow'
          : 'red'
  const backlogLamp: Lamp =
    !backlog || backlog.weeks === null ? 'none' : backlog.weeks < 4 ? 'red' : backlog.weeks < 8 ? 'yellow' : 'green'
  const moneyLamp: Lamp =
    outstanding >= 100_000 ? 'red' : outstanding > 0 || moneyWithoutValue > 0 ? 'yellow' : 'green'
  const offersLamp: Lamp = offers.length === 0 ? 'none' : toChase > 0 ? 'yellow' : 'green'
  const crewLamp: Lamp = crew.booked === 0 || crew.pct === null || crew.pct < 50 ? 'yellow' : 'green'

  /** The extra column of a job in a stage list: how long it has waited, or how late it is. */
  const stageNote = (job: TodayJob): { text: string; tone: string } | null => {
    if (job.status === 'LEAD' || job.status === 'QUOTED') {
      const started = job.plannedStart && job.plannedStart.getTime() < day
      return {
        text: [t('waitingSince', { count: job.ageDays }), started ? t('startPassed') : null].filter(Boolean).join(' · '),
        tone: job.ageDays >= STALE_OFFER_DAYS || started ? warn : 'text-muted',
      }
    }
    if (job.status === 'COMPLETED' || job.status === 'INVOICED') {
      const at = since.get(job.id)
      return at ? { text: t('situationMoneySince', { date: date(at) }), tone: 'text-muted' } : null
    }
    if (job.overdue) return { text: t('groupOverdue'), tone: danger }
    return job.plannedStart
      ? {
          text: `${date(job.plannedStart)}${job.plannedEnd ? ` – ${date(job.plannedEnd)}` : ''}`,
          tone: 'text-muted',
        }
      : null
  }

  const stageLabel = (stage: Stage) =>
    stage === 'COMPLETED' ? t('stageNotBilled') : stage === 'INVOICED' ? t('stageNotPaid') : null

  const situation = (job: TodayJob) => {
    if (job.overdue) {
      return (
        <span className={danger}>
          {job.overdue.reason === 'end'
            ? t('lateEnd', { count: job.overdue.workdaysLate })
            : t('lateStart', { count: job.overdue.workdaysLate })}
        </span>
      )
    }
    if (job.group === 'starting' && job.plannedStart) {
      const days = Math.round((Date.UTC(job.plannedStart.getUTCFullYear(), job.plannedStart.getUTCMonth(), job.plannedStart.getUTCDate()) - day) / DAY)
      return <span className="text-muted">{days === 0 ? t('startsToday') : t('startsIn', { count: days })}</span>
    }
    const progress = siteProgress(job.plannedStart, job.plannedEnd, today)
    return progress.pct === null ? (
      <span className="text-muted">—</span>
    ) : (
      <span
        className="flex items-center gap-2"
        title={t('cockpitDaysOf', { done: progress.doneDays ?? 0, planned: progress.plannedDays ?? 0 })}
      >
        <span className="h-2 w-16 rounded-sm bg-surface-hover">
          <span className="block h-2 rounded-sm bg-accent/70" style={{ width: `${progress.pct}%` }} />
        </span>
        <span className="text-[11px] tabular-nums text-muted">{progress.pct} %</span>
      </span>
    )
  }

  const siteRows = (group: 'overdue' | 'running' | 'starting', jobs: TodayJob[], title: string) => {
    if (jobs.length === 0) return null
    const sorted = [...jobs].sort((a, b) =>
      group === 'overdue'
        ? (b.overdue?.workdaysLate ?? 0) - (a.overdue?.workdaysLate ?? 0)
        : (a.plannedStart?.getTime() ?? 0) - (b.plannedStart?.getTime() ?? 0)
    )
    return (
      <tbody key={group} className="divide-y divide-border border-t border-border">
        <tr className="bg-subtle">
          <th colSpan={showFinancials ? 7 : 6} className={`${th} ${group === 'overdue' ? danger : ''}`}>
            {title} · {jobs.length}
          </th>
        </tr>
        {sorted.map((job) => {
          const notes = [
            job.missingItems > 0
              ? { key: 'material', text: `${t('colMaterial')}: ${t('materialMissingCount', { count: job.missingItems })}`, tone: warn }
              : null,
            job.checklistProblems > 0 || job.checklistOpen > 0
              ? {
                  key: 'checklist',
                  text: `${t('colChecklist')}: ${[
                    job.checklistProblems > 0 ? t('cockpitProblems', { count: job.checklistProblems }) : null,
                    job.checklistOpen > 0 ? t('cockpitOpenPoints', { count: job.checklistOpen }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}`,
                  tone: job.checklistProblems > 0 ? warn : 'text-muted',
                }
              : null,
            job.noCity ? { key: 'city', text: t('placeMissing'), tone: warn } : null,
          ].filter((note) => note !== null)
          return (
            <tr key={job.id} className="hover:bg-surface-hover">
              <td className={`${td} break-words`}>
                <Link href={`/projects/${job.id}`} className="text-accent hover:underline">
                  {job.number} — {job.name}
                </Link>
                <span className="block break-words text-[11px] text-muted">{job.customer}</span>
              </td>
              <td className={td}>
                <StatusBadge status={job.status as ProjectStatus} />
              </td>
              <td className={`${td} text-muted`}>
                {job.plannedStart
                  ? `${date(job.plannedStart)}${job.plannedEnd ? ` – ${date(job.plannedEnd)}` : ''}`
                  : job.plannedEnd
                    ? t('periodUntil', { date: date(job.plannedEnd) })
                    : '—'}
              </td>
              <td className={td}>{situation(job)}</td>
              <td className={td}>
                {job.nextVisit && job.nextVisit.getTime() - day <= SOON_DAYS * DAY ? (
                  <span className="tabular-nums">{date(job.nextVisit)}</span>
                ) : (
                  <>
                    <span className={`block ${warn}`}>{t('noVisit14', { days: SOON_DAYS })}</span>
                    {job.nextVisit && (
                      <span className="block text-[11px] tabular-nums text-muted">
                        {t('nextVisitLater', { date: date(job.nextVisit) })}
                      </span>
                    )}
                  </>
                )}
              </td>
              <td className={`${td} text-[11px]`}>
                {notes.length === 0 ? (
                  <span className="text-muted">—</span>
                ) : (
                  notes.map((note) => (
                    <span key={note.key} className={`block ${note.tone}`}>
                      {note.text}
                    </span>
                  ))
                )}
              </td>
              {showFinancials && (
                <td className={tdR}>{job.amount === null ? <span className={warn}>{t('valueMissing')}</span> : whole(job.amount)}</td>
              )}
            </tr>
          )
        })}
      </tbody>
    )
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {monthPlan &&
          tile({
            key: 'plan',
            label: t('tileMonthPlan', { month: monthPlan.label }),
            value: whole(monthPlan.total),
            caption: monthPlan.average !== null ? t('tileMonthPlanAvg', { amount: whole(monthPlan.average) }) : null,
            lamp: planLamp,
            href: '/reports?tab=revenue',
          })}
        {backlog &&
          tile({
            key: 'backlog',
            label: t('situationBacklog', { month: backlog.label }),
            value: whole(backlog.amount),
            caption: backlog.weeks !== null ? t('situationWeeks', { count: backlog.weeks }) : null,
            lamp: backlogLamp,
            href: '/reports?tab=revenue',
          })}
        {money &&
          tile({
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
            href: '/reports?open=money#stand',
          })}
        {tile({
          key: 'offers',
          label: t('areaSales'),
          value: String(offers.length),
          caption: [
            showFinancials && offers.length > 0 ? whole(sum(offers)) : null,
            toChase > 0 ? t('tileOffersCaption', { count: toChase }) : null,
          ]
            .filter(Boolean)
            .join(' · '),
          lamp: offersLamp,
          href: '/reports?open=offers#stand',
        })}
        {tile({
          key: 'overdue',
          label: t('groupOverdue'),
          value: String(overdue.length),
          caption: [
            showFinancials && overdue.length > 0 ? whole(sum(overdue)) : null,
            withoutValue(overdue) > 0 ? t('withoutValue', { count: withoutValue(overdue) }) : null,
          ]
            .filter(Boolean)
            .join(' · '),
          lamp: lampAbove(overdue.length, 1, 5),
          href: '#baustellen',
        })}
        {tile({
          key: 'crew',
          label: t('tileTeam', { month: crew.label }),
          value: crew.booked > 0 && crew.pct !== null ? `${crew.pct} %` : t('tileTeamNone'),
          caption: t('tileTeamCaption', { sites: data.schedule.sites, people: data.schedule.people }),
          lamp: crewLamp,
          href: '/reports?tab=utilization',
        })}
        {tile({
          key: 'material',
          label: t('areaMaterial'),
          value: String(withMaterialMissing.length),
          caption: t('tileMaterialCaption', {
            items: withMaterialMissing.reduce((a, j) => a + j.missingItems, 0),
            short: data.stockShort.length,
          }),
          lamp: lampAbove(withMaterialMissing.length, 1, 5),
          href: '#material',
        })}
        {tile({
          key: 'gaps',
          label: t('areaGaps'),
          value: String(gapCount),
          caption: t('tileGapsCaption'),
          lamp: lampAbove(gapCount, 1, 30),
          href: '/reports?tab=quality',
        })}
      </div>

      <div id="stand" className={`scroll-mt-40 overflow-hidden ${card}`}>
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="text-sm font-semibold">{t('stageTitle')}</h2>
          <p className="mt-0.5 text-[11px] text-muted">{t('stageHint')}</p>
        </div>
        <ul className="divide-y divide-border">
          {data.stages.rows.map((row) => {
            const jobs = current
              .filter((j) => j.status === row.stage)
              .sort((a, b) =>
                row.stage === 'LEAD' || row.stage === 'QUOTED'
                  ? b.ageDays - a.ageDays
                  : (a.plannedStart?.getTime() ?? 0) - (b.plannedStart?.getTime() ?? 0)
              )
            const suffix = stageLabel(row.stage)
            return (
              <li key={row.stage}>
                <details open={opened.has(row.stage) && jobs.length > 0} className="group">
                  <summary
                    className={`flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px] hover:bg-surface-hover [&::-webkit-details-marker]:hidden ${
                      row.count === 0 ? 'text-muted' : ''
                    }`}
                  >
                    <span aria-hidden className="text-muted transition-transform group-open:rotate-90">
                      ›
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <StatusBadge status={row.stage as ProjectStatus} />
                      {suffix && <span className="text-muted">{suffix}</span>}
                    </span>
                    <span className="tabular-nums text-muted">{t('cockpitJobs', { count: row.count })}</span>
                    {showFinancials && <span className="w-28 text-right font-medium tabular-nums">{whole(row.total)}</span>}
                    <span className={`w-28 text-right text-[11px] ${row.withoutValue > 0 ? warn : 'text-muted'}`}>
                      {row.withoutValue > 0 ? t('stageNoValue', { count: row.withoutValue }) : ''}
                    </span>
                  </summary>
                  {jobs.length === 0 ? (
                    <p className="px-9 pb-3 text-[13px] text-muted">{t('stageEmpty')}</p>
                  ) : (
                    <ul className="divide-y divide-border border-t border-border bg-subtle/40">
                      {jobs.map((job) => {
                        const note = stageNote(job)
                        return (
                          <li key={job.id} className="flex items-center justify-between gap-3 py-1.5 pl-9 pr-3 text-[13px]">
                            <span className="min-w-0">
                              <Link href={`/projects/${job.id}`} className="block truncate text-accent hover:underline">
                                {job.number} — {job.name}
                              </Link>
                              <span className="block truncate text-[11px] text-muted">{job.customer}</span>
                            </span>
                            <span className="shrink-0 text-right">
                              {note && <span className={`block text-[11px] ${note.tone}`}>{note.text}</span>}
                              {showFinancials && (
                                <span className="block tabular-nums">
                                  {job.amount === null ? <span className={warn}>{t('valueMissing')}</span> : whole(job.amount)}
                                </span>
                              )}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </details>
              </li>
            )
          })}
        </ul>
        {(() => {
          const { historicalCount, historicalTotal, paidCount, cancelledCount } = data.stages.footer
          const parts = [
            historicalCount > 0
              ? showFinancials
                ? t('stageFooterHistory', { date: cutoff ? date(cutoff) : '—', count: historicalCount, amount: whole(historicalTotal) })
                : t('stageFooterHistoryCount', { date: cutoff ? date(cutoff) : '—', count: historicalCount })
              : null,
            paidCount > 0 ? t('stageFooterPaid', { count: paidCount }) : null,
            cancelledCount > 0 ? t('stageFooterCancelled', { count: cancelledCount }) : null,
          ].filter(Boolean)
          return parts.length > 0 ? (
            <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
              {t('stageFooter')} {parts.join(' · ')}
            </p>
          ) : null
        })()}
      </div>

      <div id="baustellen" className={`scroll-mt-40 overflow-hidden ${card}`}>
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="text-sm font-semibold">{t('sitesTitle')}</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            {t('sitesSummary', { overdue: overdue.length, running: running.length, starting: starting.length })}
          </p>
        </div>
        {overdue.length + running.length + starting.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted">{t('cockpitNoSites')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full table-fixed text-sm ${showFinancials ? 'min-w-[1000px]' : 'min-w-[900px]'}`}>
              <colgroup>
                <col />
                <col className="w-32" />
                <col className="w-28" />
                <col className="w-44" />
                <col className="w-32" />
                <col className="w-40" />
                {showFinancials && <col className="w-28" />}
              </colgroup>
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>{t('colProject')}</th>
                  <th className={th}>{t('colStatus')}</th>
                  <th className={th}>{t('colPeriod')}</th>
                  <th className={th}>{t('colSituation')}</th>
                  <th className={th}>{t('colNextVisit')}</th>
                  <th className={th}>{t('colNotes')}</th>
                  {showFinancials && <th className={thR}>{t('colOrderValue')}</th>}
                </tr>
              </thead>
              {siteRows('overdue', overdue, t('groupOverdue'))}
              {siteRows('running', running, t('groupRunning'))}
              {siteRows('starting', starting, t('groupStarting'))}
            </table>
          </div>
        )}
      </div>

      <div id="material" className={`scroll-mt-40 ${card} p-4`}>
        <h2 className="text-sm font-semibold">{t('materialTitle')}</h2>
        {data.material.length === 0 && data.stockShort.length === 0 ? (
          <p className="mt-2 text-[13px] text-emerald-700 dark:text-emerald-400">✓ {t('materialNone')}</p>
        ) : (
          <div className="mt-3 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className={kpiLabel}>{t('materialOnSites')}</h3>
              <ul className="mt-1 divide-y divide-border text-[13px]">
                {data.material.map((item) => (
                  <li key={item.id} className="py-1.5">
                    <Link href={`/warehouse/${item.id}/edit`} className="text-accent hover:underline">
                      {item.name}
                    </Link>
                    <span className="block text-[11px] text-muted">
                      {item.jobs.map((j) => `${j.number} — ${j.name}`).join(' · ')}
                    </span>
                  </li>
                ))}
                {data.material.length === 0 && <li className="py-1.5 text-muted">—</li>}
              </ul>
            </div>
            <div>
              <h3 className={kpiLabel}>{t('materialStock')}</h3>
              <ul className="mt-1 divide-y divide-border text-[13px]">
                {data.stockShort.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
                    <Link href={`/warehouse/${item.id}/edit`} className="truncate text-accent hover:underline">
                      {item.name}
                    </Link>
                    <span className={`shrink-0 tabular-nums ${warn}`}>
                      {t('materialStockLine', {
                        stock: `${item.stock}${item.unit ? ` ${item.unit}` : ''}`,
                        need: `${item.need}${item.unit ? ` ${item.unit}` : ''}`,
                      })}
                    </span>
                  </li>
                ))}
                {data.stockShort.length === 0 && <li className="py-1.5 text-muted">—</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
