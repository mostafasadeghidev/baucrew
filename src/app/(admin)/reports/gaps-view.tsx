/**
 * The Datenlücken tab of the reporting page: what is missing or contradicts
 * itself, so that a figure on another tab is wrong or incomplete — and where
 * to put it right.
 *
 * On top one tile per kind of gap with its count and the money it touches, the
 * way the other tabs open on their figures; a tile narrows the list to its kind
 * (`?gap=`), a second click shows all again. Under them each kind is a table
 * of its own across the page, every row leading to the entry to fix. The tab's
 * count is the one on its badge. Stand heute: it does not follow the year and
 * period pickers.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { ProjectStatus } from '@/generated/prisma/enums'
import { StatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/format'
import { pricesHidden } from '@/lib/price-visibility'
import type { GapProject, GapReport } from '@/lib/data-gaps'

const card = 'rounded-xl border border-border bg-surface'
const th = 'px-3 py-2 text-left text-xs font-medium text-muted'
const thR = `${th} text-right`
const td = 'px-3 py-2 align-middle'
const tdR = `${td} text-right tabular-nums`
const chip = 'rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400'
const up = 'text-emerald-700 dark:text-emerald-400'
const warn = 'text-amber-700 dark:text-amber-400'

/** The kinds of gap, in the order they are shown; the value is what `?gap=` carries. */
export const GAP_KINDS = ['value', 'plan', 'sub', 'lines', 'town'] as const
export type GapKind = (typeof GAP_KINDS)[number]

export async function GapsView({
  report,
  showFinancials,
  locale,
  cutoff,
  monthNames,
  focus,
}: {
  report: GapReport
  showFinancials: boolean
  locale: string
  cutoff: Date | null
  monthNames: string[]
  /** The one kind the list is narrowed to; null shows every kind. */
  focus: GapKind | null
}) {
  const t = await getTranslations('reports')
  const hidePrices = await pricesHidden()
  const whole = (v: number) => formatCurrency(v, locale, { whole: true, hidden: hidePrices })
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${whole(Math.abs(v))}`

  const looseTotal = report.looseLines.reduce((sum, l) => sum + l.amount, 0)
  const diffTotal = report.valueVsPlan.reduce((sum, r) => sum + Math.abs(r.difference), 0)
  const withoutValue = report.valueOrDate.filter((r) => r.valueMissing).length
  const withoutDate = report.valueOrDate.filter((r) => r.dateMissing).length

  const kinds: Array<{ kind: GapKind; label: string; count: number; detail: string | null }> = [
    {
      kind: 'value',
      label: t('gapTileValueOrDate'),
      count: report.valueOrDate.length,
      detail: report.valueOrDate.length > 0 ? t('gapTileValueOrDateDetail', { value: withoutValue, date: withoutDate }) : null,
    },
    {
      kind: 'plan',
      label: t('gapTileValueVsPlan'),
      count: report.valueVsPlan.length,
      detail: showFinancials && diffTotal > 0 ? t('gapTileDifference', { amount: whole(diffTotal) }) : null,
    },
    { kind: 'sub', label: t('gapTileSub'), count: report.subConflict.length, detail: null },
    {
      kind: 'lines',
      label: t('gapTileLooseLines'),
      count: report.looseLines.length,
      detail: showFinancials && looseTotal > 0 ? t('gapTileAmount', { amount: whole(looseTotal) }) : null,
    },
    { kind: 'town', label: t('gapTileNoTown'), count: report.noTown.length, detail: null },
  ]
  const shown = (kind: GapKind) => focus === null || focus === kind
  const tileHref = (kind: GapKind) => (focus === kind ? '/reports?tab=quality' : `/reports?tab=quality&gap=${kind}`)

  /** The job a row stands for: number and name as the way to it, the customer under it. */
  const job = (p: GapProject) => (
    <td className={td}>
      <Link href={`/projects/${p.id}`} className="block truncate font-medium hover:text-accent hover:underline" title={p.name}>
        <span className="mr-2 font-normal tabular-nums text-muted">{p.number}</span>
        {p.name}
      </Link>
      <span className="block truncate text-xs text-muted">{p.customer}</span>
    </td>
  )

  /** One kind of gap across the page: what it is and how it is fixed, then its rows. */
  const section = ({
    kind,
    title,
    hint,
    action,
    head,
    rows,
    footer,
  }: {
    kind: GapKind
    title: string
    hint: string
    action?: ReactNode
    head: ReactNode
    rows: ReactNode
    footer?: ReactNode
  }) => {
    const count = kinds.find((k) => k.kind === kind)!.count
    if (!shown(kind) || (focus === null && count === 0)) return null
    return (
      <section key={kind} id={`gap-${kind}`} className={`overflow-hidden ${card}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
          <div className="min-w-0 max-w-3xl">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {title}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${count === 0 ? `bg-emerald-500/15 ${up}` : `bg-amber-500/15 ${warn}`}`}>
                {count}
              </span>
            </h2>
            <p className="mt-1 text-xs text-muted">{hint}</p>
          </div>
          {action}
        </div>
        {count === 0 ? (
          <p className={`flex items-center gap-2 px-4 py-4 text-sm ${up}`}>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {t('gapNone')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed text-[13px]">
              <thead className="border-b border-border bg-subtle">{head}</thead>
              <tbody className="divide-y divide-border">{rows}</tbody>
            </table>
          </div>
        )}
        {footer}
      </section>
    )
  }

  const planLink = (year: number) => (
    <Link href={`/reports/plan?year=${year}`} className="shrink-0 text-xs font-medium text-accent hover:underline">
      {t('gapOpenPlan')} →
    </Link>
  )

  return (
    <section className="space-y-4">
      {/* The figures first: how many of each kind, and what they touch. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 print:hidden">
        {kinds.map(({ kind, label, count, detail }) => {
          const active = focus === kind
          return (
            <Link
              key={kind}
              href={tileHref(kind)}
              scroll={false}
              aria-current={active ? 'true' : undefined}
              className={`${card} flex flex-col gap-1 p-3 transition-colors hover:border-accent/50 ${
                active ? 'border-accent ring-2 ring-accent/20' : ''
              } ${focus !== null && !active ? 'opacity-60 hover:opacity-100' : ''}`}
            >
              <span className="text-xs text-muted">{label}</span>
              <span className={`flex items-center gap-1.5 text-2xl font-semibold tabular-nums tracking-tight ${count === 0 ? up : ''}`}>
                {count === 0 ? <CheckCircle2 className="h-5 w-5" aria-label={t('gapNone')} /> : count}
              </span>
              <span className="min-h-4 text-[11px] text-muted">{count === 0 ? t('gapNone') : detail}</span>
            </Link>
          )
        })}
      </div>

      {report.count === 0 && focus === null && (
        <p className={`${card} flex items-center gap-2 p-4 text-sm ${up}`}>
          <CheckCircle2 className="h-4 w-4" aria-hidden /> {t('qualityAllGood')}
        </p>
      )}

      {section({
        kind: 'value',
        title: t('gapValueOrDate'),
        hint: t('gapValueOrDateHint'),
        head: (
          <tr>
            <th className={th}>{t('gapColJob')}</th>
            <th className={`${th} w-40`}>{t('gapColStatus')}</th>
            <th className={`${th} w-52`}>{t('gapColMissing')}</th>
          </tr>
        ),
        rows: report.valueOrDate.map(({ project, valueMissing, dateMissing }) => (
          <tr key={project.id} className="hover:bg-surface-hover">
            {job(project)}
            <td className={td}>
              <StatusBadge status={project.status as ProjectStatus} />
            </td>
            <td className={td}>
              <span className="flex flex-wrap gap-1.5">
                {valueMissing && <span className={chip}>{t('valueMissing')}</span>}
                {dateMissing && <span className={chip}>{t('dateMissing')}</span>}
              </span>
            </td>
          </tr>
        )),
      })}

      {section({
        kind: 'plan',
        title: t('gapValueVsPlan'),
        hint: t('gapValueVsPlanHint'),
        head: (
          <tr>
            <th className={th}>{t('gapColJob')}</th>
            {showFinancials ? (
              <>
                <th className={`${thR} w-36`}>{t('gapColOrder')}</th>
                <th className={`${thR} w-36`}>{t('gapColPlan')}</th>
                <th className={`${thR} w-36`}>{t('gapColDiff')}</th>
              </>
            ) : (
              <th className={`${th} w-40`}>{t('gapColStatus')}</th>
            )}
          </tr>
        ),
        rows: report.valueVsPlan.map(({ project, planTotal, difference }) => (
          <tr key={project.id} className="hover:bg-surface-hover">
            {job(project)}
            {showFinancials ? (
              <>
                <td className={`${tdR} text-muted`}>{whole(project.amount ?? 0)}</td>
                <td className={`${tdR} text-muted`}>{whole(planTotal)}</td>
                <td className={`${tdR} font-medium ${warn}`}>{signed(difference)}</td>
              </>
            ) : (
              <td className={td}>
                <StatusBadge status={project.status as ProjectStatus} />
              </td>
            )}
          </tr>
        )),
      })}

      {section({
        kind: 'sub',
        title: t('gapSub'),
        hint: t('gapSubHint'),
        head: (
          <tr>
            <th className={th}>{t('gapColJob')}</th>
            <th className={`${th} w-40`}>{t('gapColProjectSays')}</th>
            <th className={`${th} w-40`}>{t('gapColPlanSays')}</th>
          </tr>
        ),
        rows: report.subConflict.map((project) => (
          <tr key={project.id} className="hover:bg-surface-hover">
            {job(project)}
            <td className={td}>{project.isSub ? t('sub') : t('ownPeople')}</td>
            <td className={`${td} ${warn}`}>{project.isSub ? t('ownPeople') : t('sub')}</td>
          </tr>
        )),
      })}

      {section({
        kind: 'lines',
        title: t('gapLooseLines'),
        hint: t('gapLooseLinesHint'),
        action: report.looseLines.length > 0 ? planLink(report.looseLines[0].year) : undefined,
        head: (
          <tr>
            <th className={th}>{t('gapColLine')}</th>
            <th className={`${th} w-44`}>{t('gapColMonth')}</th>
            {showFinancials && <th className={`${thR} w-36`}>{t('gapColAmount')}</th>}
          </tr>
        ),
        rows: report.looseLines.map((line) => (
          <tr key={line.id} className="hover:bg-surface-hover">
            <td className={td}>
              <Link href={`/reports/plan?year=${line.year}`} className="block truncate font-medium hover:text-accent hover:underline" title={line.name}>
                {line.name}
              </Link>
            </td>
            <td className={`${td} text-muted`}>
              {line.month ? `${monthNames[line.month - 1]} ${line.year}` : t('gapNoMonth', { year: line.year })}
            </td>
            {showFinancials && <td className={tdR}>{whole(line.amount)}</td>}
          </tr>
        )),
        footer:
          report.looseLinesPast.count > 0 ? (
            <p className="border-t border-border px-4 py-2 text-xs text-muted">
              {showFinancials
                ? t('gapLooseLinesPast', { count: report.looseLinesPast.count, amount: whole(report.looseLinesPast.total) })
                : t('gapLooseLinesPastCount', { count: report.looseLinesPast.count })}
            </p>
          ) : null,
      })}

      {section({
        kind: 'town',
        title: t('gapNoTown'),
        hint: t('gapNoTownHint'),
        head: (
          <tr>
            <th className={th}>{t('gapColJob')}</th>
            <th className={`${th} w-40`}>{t('gapColStatus')}</th>
            <th className={`${th} w-36`}>{t('gapColStart')}</th>
          </tr>
        ),
        rows: report.noTown.map((project) => (
          <tr key={project.id} className="hover:bg-surface-hover">
            {job(project)}
            <td className={td}>
              <StatusBadge status={project.status as ProjectStatus} />
            </td>
            <td className={`${td} tabular-nums text-muted`}>{project.plannedStart ? formatDate(project.plannedStart, locale) : '—'}</td>
          </tr>
        )),
      })}

      {report.historicalWithGaps > 0 && (
        <p className="text-xs text-muted">
          {t('gapHistorical', { count: report.historicalWithGaps, date: cutoff ? formatDate(cutoff, locale) : '—' })}
        </p>
      )}
    </section>
  )
}
