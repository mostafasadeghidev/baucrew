/**
 * The CRM's "Aufträge & Baustellen" tab: the long lists behind the Heute tiles.
 *
 * Every job that still matters, by the stage it stands in; the sites — late,
 * running, starting soon — as one card each, every job once, in groups or as a
 * kanban with a column for each group; and
 * the material that is missing. Heute keeps the tiles and opens a short version
 * of each under them; this is where the whole of it is read.
 *
 * Everything here is "Stand heute": it does not follow the year and period
 * pickers. Old data — work finished before the history cutoff — never shows in
 * a list; where it is left out, a footnote counts it.
 */

import Link from 'next/link'
import { Fragment } from 'react'
import { getTranslations } from 'next-intl/server'
import type { ProjectStatus } from '@/generated/prisma/enums'
import { ParamTabs } from '@/components/param-tabs'
import { StatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/format'
import { siteProgress, SOON_DAYS, type Stage } from '@/lib/cockpit'
import type { OpenMoney } from '@/lib/order-situation'
import { STALE_OFFER_DAYS, type Today, type TodayJob } from '@/lib/reports'

const card = 'rounded-xl border border-border bg-surface shadow-sm'
const label = 'text-[11px] uppercase tracking-wide text-muted'
const warn = 'text-amber-700 dark:text-amber-400'
const danger = 'text-red-700 dark:text-red-400'

const DAY = 86_400_000

/** The edge on top of each kanban column. Literal, so Tailwind finds them. */
const COLUMN_EDGE = {
  overdue: 'border-t-red-500',
  running: 'border-t-accent',
  starting: 'border-t-sky-500',
} as const

/** Which stage rows a `?open=` value unfolds — a link from Heute, the old offers tab. */
const OPENS: Record<string, readonly Stage[]> = {
  offers: ['LEAD', 'QUOTED'],
  ordered: ['APPROVED', 'PLANNED', 'IN_PROGRESS'],
  money: ['COMPLETED', 'INVOICED'],
}

/** The jobs Heute and this tab both read: not old data, not cancelled. */
export const currentJobs = (data: Today) => data.jobs.filter((j) => !j.historical && j.status !== 'CANCELLED')

export async function JobsView({
  data,
  money,
  showFinancials,
  locale,
  today,
  open,
  sitesView,
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
  /** The sites in groups of cards, or as a kanban with a column for each group (`?sites=kanban`). */
  sitesView: 'cards' | 'kanban'
  cutoff: Date | null
}) {
  const t = await getTranslations('reports')
  const whole = (v: number) => formatCurrency(v, locale, { whole: true })
  const date = (d: Date) => formatDate(d, locale)
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  const current = currentJobs(data)
  const overdue = current.filter((j) => j.group === 'overdue')
  const running = current.filter((j) => j.group === 'running')
  const starting = current.filter((j) => j.group === 'starting')
  const moneyRows = money ? [...money.done.rows, ...money.invoiced.rows] : []
  const opened = new Set(OPENS[open ?? ''] ?? [])
  const since = new Map(moneyRows.map((r) => [r.id, r.since]))

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
      const days = Math.round(
        (Date.UTC(job.plannedStart.getUTCFullYear(), job.plannedStart.getUTCMonth(), job.plannedStart.getUTCDate()) - day) / DAY
      )
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

  /** The three groups of sites, each in its order: the latest first, then by start. */
  const siteGroups = (
    [
      ['overdue', t('groupOverdue'), overdue],
      ['running', t('groupRunning'), running],
      ['starting', t('groupStarting'), starting],
    ] as const
  ).map(([key, title, jobs]) => ({
    key,
    title,
    jobs: [...jobs].sort((a, b) =>
      key === 'overdue'
        ? (b.overdue?.workdaysLate ?? 0) - (a.overdue?.workdaysLate ?? 0)
        : (a.plannedStart?.getTime() ?? 0) - (b.plannedStart?.getTime() ?? 0)
    ),
  }))

  /**
   * A site as a card, the same in both views: the job on top, then its dates,
   * where it stands, the next day on site, what is missing and its value. On
   * the kanban it stands out from its column.
   */
  const siteCard = (job: TodayJob, late: boolean, onBoard: boolean) => {
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
      <li
        key={job.id}
        className={`overflow-hidden rounded-lg border ${onBoard ? 'bg-surface shadow-sm' : 'bg-subtle/40'} ${
          late ? 'border-red-300 dark:border-red-500/40' : 'border-border'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <p className="text-[11px] tabular-nums text-muted">{job.number}</p>
            <Link
              href={`/projects/${job.id}`}
              title={job.name}
              className="block truncate text-[13px] font-medium text-accent hover:underline"
            >
              {job.name}
            </Link>
            <p className="truncate text-[11px] text-muted" title={job.customer}>
              {job.customer}
            </p>
          </div>
          <span className="shrink-0">
            <StatusBadge status={job.status as ProjectStatus} />
          </span>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2 text-[12px]">
          <dt className="text-muted">{t('colPeriod')}</dt>
          <dd className="tabular-nums">
            {job.plannedStart
              ? `${date(job.plannedStart)}${job.plannedEnd ? ` – ${date(job.plannedEnd)}` : ''}`
              : job.plannedEnd
                ? t('periodUntil', { date: date(job.plannedEnd) })
                : '—'}
          </dd>
          <dt className="text-muted">{t('colSituation')}</dt>
          <dd>{situation(job)}</dd>
          <dt className="text-muted">{t('colNextVisit')}</dt>
          <dd>
            <NextVisit
              job={job}
              day={day}
              locale={locale}
              labels={{ none: t('noVisit14', { days: SOON_DAYS }), later: (d) => t('nextVisitLater', { date: d }) }}
            />
          </dd>
          <dt className="text-muted">{t('colNotes')}</dt>
          <dd>
            {notes.length === 0 ? (
              <span className="text-muted">—</span>
            ) : (
              notes.map((note) => (
                <span key={note.key} className={`block ${note.tone}`}>
                  {note.text}
                </span>
              ))
            )}
          </dd>
          {showFinancials && (
            <>
              <dt className="text-muted">{t('colOrderValue')}</dt>
              <dd className="font-medium tabular-nums">
                {job.amount === null ? <span className={warn}>{t('valueMissing')}</span> : whole(job.amount)}
              </dd>
            </>
          )}
        </dl>
      </li>
    )
  }

  return (
    <section className="space-y-4">
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t('sitesTitle')}</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {t('sitesSummary', { overdue: overdue.length, running: running.length, starting: starting.length })}
            </p>
          </div>
          {/* The switch sits far down the page: choosing leaves the page where it is. */}
          <ParamTabs
            param="sites"
            ariaLabel={t('sitesTitle')}
            scroll={false}
            tabs={[
              { value: '', label: t('sitesViewCards') },
              { value: 'kanban', label: t('sitesViewKanban') },
            ]}
          />
        </div>
        {overdue.length + running.length + starting.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted">{t('cockpitNoSites')}</p>
        ) : sitesView === 'kanban' ? (
          // A column for each group, all three always there; a column scrolls on
          // its own. No card is dragged: a site's column follows from its dates.
          <div className="grid auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-3 overflow-x-auto p-3">
            {siteGroups.map((group) => (
              <section
                key={group.key}
                aria-label={group.title}
                className={`flex min-w-0 flex-col rounded-lg border-t-2 bg-subtle ${COLUMN_EDGE[group.key]}`}
              >
                <h3
                  className={`flex items-center justify-between gap-2 px-3 py-2 ${label} ${group.key === 'overdue' ? danger : ''}`}
                >
                  <span>{group.title}</span>
                  <span className="tabular-nums">{group.jobs.length}</span>
                </h3>
                {group.jobs.length === 0 ? (
                  <p className="px-3 pb-3 text-[12px] text-muted">{t('sitesColumnEmpty')}</p>
                ) : (
                  <ul className="max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto px-2 pb-2">
                    {group.jobs.map((job) => siteCard(job, group.key === 'overdue', true))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-5 p-3">
            {siteGroups
              .filter((group) => group.jobs.length > 0)
              .map((group) => (
                <div key={group.key}>
                  <h3 className={`${label} ${group.key === 'overdue' ? danger : ''}`}>
                    {group.title} · {group.jobs.length}
                  </h3>
                  <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {group.jobs.map((job) => siteCard(job, group.key === 'overdue', false))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </div>

      <div id="material" className={`scroll-mt-40 ${card} p-4`}>
        <h2 className="text-sm font-semibold">{t('materialTitle')}</h2>
        <div className="mt-3">
          <MaterialLists data={data} />
        </div>
      </div>
    </section>
  )
}

/** The next day a job is on the schedule — or a warning when nothing is within two weeks. */
export function NextVisit({
  job,
  day,
  locale,
  labels,
}: {
  job: TodayJob
  /** Today, as UTC midnight in milliseconds. */
  day: number
  locale: string
  labels: { none: string; later: (date: string) => string }
}) {
  if (job.nextVisit && job.nextVisit.getTime() - day <= SOON_DAYS * DAY) {
    return <span className="tabular-nums">{formatDate(job.nextVisit, locale)}</span>
  }
  return (
    <>
      <span className={`block ${warn}`}>{labels.none}</span>
      {job.nextVisit && (
        <span className="block text-[11px] tabular-nums text-muted">{labels.later(formatDate(job.nextVisit, locale))}</span>
      )}
    </>
  )
}

/**
 * What is missing on the sites and what the warehouse is short of — on this tab
 * and in the Heute tile.
 *
 * An article links to the article in the warehouse; the jobs under it link to
 * their own list of tools and materials, because that is where "missing" was
 * marked and where it is set right again.
 */
export async function MaterialLists({ data }: { data: Today }) {
  const t = await getTranslations('reports')
  if (data.material.length === 0 && data.stockShort.length === 0) {
    return <p className="text-[13px] text-emerald-700 dark:text-emerald-400">✓ {t('materialNone')}</p>
  }
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className={label}>{t('materialOnSites')}</h3>
        <ul className="mt-1 divide-y divide-border text-[13px]">
          {data.material.map((item) => (
            <li key={item.id} className="py-1.5">
              <Link href={`/warehouse/${item.id}/edit`} className="text-accent hover:underline">
                {item.name}
              </Link>
              <span className="block text-[11px] text-muted">
                {item.jobs.map((job, index) => (
                  <Fragment key={job.id}>
                    {index > 0 && ' · '}
                    <Link href={`/projects/${job.id}#material`} className="text-accent hover:underline">
                      {job.number} — {job.name}
                    </Link>
                  </Fragment>
                ))}
              </span>
            </li>
          ))}
          {data.material.length === 0 && <li className="py-1.5 text-muted">—</li>}
        </ul>
      </div>
      <div>
        <h3 className={label}>{t('materialStock')}</h3>
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
  )
}
