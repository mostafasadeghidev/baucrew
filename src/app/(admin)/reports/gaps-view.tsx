/**
 * The CRM's Datenlücken tab: what is missing or contradicts itself, so that a
 * figure on another tab is wrong or incomplete — and where to put it right.
 *
 * Each card says what is wrong, which money it touches and how it is fixed; each
 * row leads to the entry. The tab's count is the one shown on the Heute tile and
 * next to the Planumsatz, so the office never meets two numbers for one thing.
 * Stand heute: it does not follow the year and period pickers.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import type { ProjectStatus } from '@/generated/prisma/enums'
import { StatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import type { GapProject, GapReport } from '@/lib/data-gaps'

const card = 'rounded-xl border border-border bg-surface shadow-sm'
const chip = 'rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400'
const up = 'text-emerald-700 dark:text-emerald-400'

export async function GapsView({
  report,
  showFinancials,
  locale,
  cutoff,
  monthNames,
}: {
  report: GapReport
  showFinancials: boolean
  locale: string
  cutoff: Date | null
  monthNames: string[]
}) {
  const t = await getTranslations('reports')
  const hidePrices = await pricesHidden()
  const whole = (v: number) => formatCurrency(v, locale, { whole: true, hidden: hidePrices })
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${whole(Math.abs(v))}`

  const job = (p: GapProject) => (
    <span className="min-w-0">
      <Link href={`/projects/${p.id}`} className="block truncate text-accent hover:underline">
        {p.number} — {p.name}
      </Link>
      <span className="block truncate text-[11px] text-muted">{p.customer}</span>
    </span>
  )

  const section = ({
    id,
    title,
    hint,
    count,
    total,
    children,
    footer,
  }: {
    id: string
    title: string
    hint: string
    count: number
    total?: number | null
    children: ReactNode
    footer?: ReactNode
  }) => (
    <section key={id} id={id} className={`scroll-mt-40 overflow-hidden ${card}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
        </div>
        <span className="shrink-0 text-right">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
              count === 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
            }`}
          >
            {count}
          </span>
          {showFinancials && total != null && total !== 0 && (
            <span className="mt-0.5 block text-[11px] tabular-nums text-muted">{whole(total)}</span>
          )}
        </span>
      </div>
      {count === 0 ? <p className={`px-3 py-2 text-[13px] ${up}`}>✓ {t('gapNone')}</p> : children}
      {footer}
    </section>
  )

  const looseTotal = report.looseLines.reduce((sum, l) => sum + l.amount, 0)
  const diffTotal = report.valueVsPlan.reduce((sum, r) => sum + r.difference, 0)

  return (
    <section className="space-y-4">
      {report.count === 0 && <p className={`${card} p-4 text-sm ${up}`}>✓ {t('qualityAllGood')}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {section({
          id: 'wert-termin',
          title: t('gapValueOrDate'),
          hint: t('gapValueOrDateHint'),
          count: report.valueOrDate.length,
          children: (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {report.valueOrDate.map(({ project, valueMissing, dateMissing }) => (
                <li key={project.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
                  {job(project)}
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <StatusBadge status={project.status as ProjectStatus} />
                    {valueMissing && <span className={chip}>{t('valueMissing')}</span>}
                    {dateMissing && <span className={chip}>{t('dateMissing')}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ),
        })}

        {section({
          id: 'wert-plan',
          title: t('gapValueVsPlan'),
          hint: t('gapValueVsPlanHint'),
          count: report.valueVsPlan.length,
          total: showFinancials ? diffTotal : null,
          children: (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {report.valueVsPlan.map(({ project, planTotal, difference }) => (
                <li key={project.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
                  {job(project)}
                  {showFinancials ? (
                    <span className="shrink-0 text-right text-[11px] tabular-nums text-muted">
                      <span className="block">
                        {t('gapOrderValue')} {whole(project.amount ?? 0)} · {t('gapPlanValue')} {whole(planTotal)}
                      </span>
                      <span className="block font-medium text-amber-700 dark:text-amber-400">{signed(difference)}</span>
                    </span>
                  ) : (
                    <StatusBadge status={project.status as ProjectStatus} />
                  )}
                </li>
              ))}
            </ul>
          ),
        })}

        {section({
          id: 'sub',
          title: t('gapSub'),
          hint: t('gapSubHint'),
          count: report.subConflict.length,
          children: (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {report.subConflict.map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
                  {job(project)}
                  <span className="shrink-0 text-right text-[11px] text-muted">
                    {t(project.isSub ? 'gapSubProjectSub' : 'gapSubProjectOwn')}
                  </span>
                </li>
              ))}
            </ul>
          ),
        })}

        {section({
          id: 'nicht-geplant',
          title: t('gapNotInPlan'),
          hint: t('gapNotInPlanHint'),
          count: report.notInPlan.length,
          children: (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {report.notInPlan.map(({ project, year }) => (
                <li key={project.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
                  {job(project)}
                  <Link href={`/reports/plan?year=${year}`} className="shrink-0 text-[11px] text-accent hover:underline">
                    {t('gapPlanLink', { year })} →
                  </Link>
                </li>
              ))}
            </ul>
          ),
        })}

        {section({
          id: 'planzeilen',
          title: t('gapLooseLines'),
          hint: t('gapLooseLinesHint'),
          count: report.looseLines.length,
          total: showFinancials ? looseTotal : null,
          children: (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {report.looseLines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
                  <span className="min-w-0">
                    <Link href={`/reports/plan?year=${line.year}`} className="block truncate text-accent hover:underline">
                      {line.name}
                    </Link>
                    <span className="block text-[11px] text-muted">
                      {line.month ? `${monthNames[line.month - 1]} ${line.year}` : t('gapNoMonth', { year: line.year })}
                    </span>
                  </span>
                  {showFinancials && <span className="shrink-0 tabular-nums text-muted">{whole(line.amount)}</span>}
                </li>
              ))}
            </ul>
          ),
          footer:
            report.looseLinesPast.count > 0 ? (
              <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
                {showFinancials
                  ? t('gapLooseLinesPast', { count: report.looseLinesPast.count, amount: whole(report.looseLinesPast.total) })
                  : t('gapLooseLinesPastCount', { count: report.looseLinesPast.count })}
              </p>
            ) : null,
        })}
      </div>

      {report.historicalWithGaps > 0 && (
        <p className="text-[11px] text-muted">
          {t('gapHistorical', { count: report.historicalWithGaps, date: cutoff ? formatDate(cutoff, locale) : '—' })}
        </p>
      )}
    </section>
  )
}
