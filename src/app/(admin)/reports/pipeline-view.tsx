/**
 * The CRM's "Pipeline" tab: what is on its way to becoming a job.
 *
 * Three columns — enquiry, offer written, order placed but not yet planned —
 * each with its count and its sum, the longest-sitting project at the top and
 * marked once it has sat too long. Every card carries the status menu and the
 * one-click next step the project list has, so an offer is confirmed from
 * here without opening it. Over the columns the running year: what came in,
 * what was won, what was lost, and the rate between the two.
 *
 * Everything here is "Stand heute": it does not follow the year and period
 * pickers. Prices only for whoever may see them.
 */

import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Clock } from 'lucide-react'
import type { ProjectStatus } from '@/generated/prisma/enums'
import { STATUS_STYLES } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import { nextStatus } from '@/lib/status-flow'
import { STALE_DAYS, type PipelineColumn, type PipelineStage, type YearFunnel } from '@/lib/pipeline'
import { ListStatus } from '../projects/list-status'

const card = 'rounded-xl border border-border bg-surface shadow-sm'
const label = 'text-[11px] uppercase tracking-wide text-muted'
const warn = 'text-amber-700 dark:text-amber-400'

/** The edge on top of each column. Literal, so Tailwind finds them. */
const COLUMN_EDGE: Record<PipelineStage, string> = {
  LEAD: 'border-t-neutral-400',
  QUOTED: 'border-t-sky-500',
  APPROVED: 'border-t-indigo-500',
}

const STATUSES: ProjectStatus[] = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED']

export async function PipelineView({
  columns,
  funnel,
  showFinancials,
  locale,
  year,
}: {
  columns: PipelineColumn[]
  funnel: YearFunnel
  showFinancials: boolean
  locale: string
  /** The running year the funnel tiles stand for. */
  year: number
}) {
  const [t, tStatus] = await Promise.all([getTranslations('reports'), getTranslations('status')])
  const hidePrices = await pricesHidden()
  const whole = (v: number | null) => formatCurrency(v, locale, { whole: true, hidden: hidePrices })
  const percent = (v: number) => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'de-DE', { style: 'percent', maximumFractionDigits: 0 }).format(v)
  const options = STATUSES.map((s) => ({ value: s, label: tStatus(s) }))

  const openCount = columns.reduce((sum, c) => sum + c.count, 0)
  const openSum = columns.reduce((sum, c) => sum + c.sum, 0)
  const tiles: Array<{ key: string; title: string; value: string; note?: string; tone?: string }> = [
    {
      key: 'open',
      title: t('pipelineOpen'),
      value: String(openCount),
      note: showFinancials ? whole(openSum) : undefined,
    },
    {
      key: 'won',
      title: t('pipelineWon', { year }),
      value: String(funnel.won),
      note: showFinancials ? whole(funnel.wonSum) : undefined,
    },
    { key: 'lost', title: t('pipelineLost', { year }), value: String(funnel.lost) },
    {
      key: 'rate',
      title: t('pipelineRate', { year }),
      value: funnel.winRate == null ? '—' : percent(funnel.winRate),
      note: t('pipelineRateNote', { decided: funnel.won + funnel.lost, arrived: funnel.total }),
    },
  ]

  return (
    <section className="space-y-4">
      {/* The year in four tiles. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.key} className={`${card} px-4 py-3`}>
            <p className={label}>{tile.title}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</p>
            {tile.note && <p className="text-[12px] text-muted">{tile.note}</p>}
          </div>
        ))}
      </div>

      {/* The columns. No card is dragged: its status menu moves it. */}
      <div className={`${card} p-3`}>
        {openCount === 0 ? (
          <p className="px-1 py-6 text-sm text-muted">{t('pipelineEmpty')}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {columns.map((column) => (
              <section
                key={column.stage}
                aria-label={tStatus(column.stage)}
                className={`flex min-w-0 flex-col rounded-lg border-t-2 bg-subtle ${COLUMN_EDGE[column.stage]}`}
              >
                <h3 className={`flex items-center justify-between gap-2 px-3 py-2 ${label}`}>
                  <span>{tStatus(column.stage)}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {column.stale > 0 && (
                      <span className={warn} title={t('pipelineStaleHint', { days: STALE_DAYS[column.stage] })}>
                        {t('pipelineStale', { n: column.stale })}
                      </span>
                    )}
                    <span>{column.count}</span>
                  </span>
                </h3>
                {showFinancials && (
                  <p className="px-3 pb-2 text-[12px] text-muted">
                    {whole(column.sum)}
                    {column.unpriced > 0 && <> · {t('pipelineUnpriced', { n: column.unpriced })}</>}
                  </p>
                )}
                {column.cards.length === 0 ? (
                  <p className="px-3 pb-3 text-[12px] text-muted">{t('pipelineColumnEmpty')}</p>
                ) : (
                  <ul className="max-h-[calc(100vh-18rem)] space-y-2 overflow-y-auto px-2 pb-2">
                    {column.cards.map((p) => {
                      const next = nextStatus(p.status)
                      return (
                        <li key={p.id} className={`rounded-lg border bg-surface p-3 shadow-sm ${p.stale ? 'border-amber-500/50' : 'border-border'}`}>
                          <Link href={`/projects/${p.id}`} className="block font-medium hover:underline">
                            <span className="tabular-nums text-muted">{p.number}</span> {p.name}
                          </Link>
                          <p className="mt-0.5 truncate text-[12px] text-muted">{p.customer}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">
                            <span className={`inline-flex items-center gap-1 ${p.stale ? warn : ''}`}>
                              <Clock className="h-3 w-3" aria-hidden />
                              {t('pipelineAge', { n: p.ageDays })}
                            </span>
                            {p.plannedStart && <span>{t('pipelineStart', { date: formatDate(p.plannedStart, locale) })}</span>}
                            {showFinancials && (
                              <span className="ml-auto tabular-nums text-foreground">{p.price == null ? t('pipelineNoPrice') : whole(p.price)}</span>
                            )}
                          </p>
                          <div className="mt-2">
                            <ListStatus
                              projectId={p.id}
                              projectLabel={`${p.number} — ${p.name}`}
                              status={p.status}
                              next={next ? { value: next, label: tStatus(next as ProjectStatus) } : null}
                              options={options}
                              colorClass={STATUS_STYLES[p.status as ProjectStatus]}
                              confirmNext={false}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
