import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { addDays, iso, todayUtc, utcDate } from '@/lib/dates'
import { BackLink } from '@/components/back-link'
import { StockWarning } from '@/components/stock-warning'
import { btn } from '@/components/ui/button'

const card = 'overflow-hidden rounded-lg border border-border bg-surface shadow-sm'
const STATUS_STYLE: Record<string, string> = {
  COLLECTED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  MISSING: 'bg-red-500/15 text-red-700 dark:text-red-400',
  REQUIRED: 'bg-surface-hover text-muted',
}

/**
 * Dashboard sub page: warehouse preparation for a day — every assignment with
 * its packing list and status, read-only, with a link to the project.
 */
export default async function PackingOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireManagement()
  const { date: dateParam } = await searchParams
  const [t, tNav, tToday, tItem, tSheet, locale] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('nav'),
    getTranslations('today'),
    getTranslations('itemStatus'),
    getTranslations('sheet'),
    getLocale(),
  ])
  const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? utcDate(dateParam) : todayUtc()
  const isToday = iso(day) === iso(todayUtc())

  const entries = await db.scheduleEntry.findMany({
    where: { date: day, cancelledAt: null },
    include: {
      project: {
        select: {
          id: true,
          number: true,
          name: true,
          customer: { select: { name: true } },
          items: {
            include: { catalogItem: { select: { name: true, unit: true, stockQuantity: true } } },
            orderBy: { catalogItem: { name: 'asc' } },
          },
        },
      },
      vehicles: { include: { vehicle: { select: { name: true } } } },
      employees: {
        include: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  })

  const dayLabel = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(day)
  const totals = entries.reduce(
    (acc, e) => {
      acc.total += e.project.items.length
      acc.done += e.project.items.filter((i) => i.status === 'COLLECTED').length
      acc.missing += e.project.items.filter((i) => i.status === 'MISSING').length
      return acc
    },
    { total: 0, done: 0, missing: 0 }
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <BackLink href="/dashboard" label={tNav('dashboard')} />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('packingToday')}{' '}
            <span className="text-base font-normal text-muted">
              {isToday ? `${t('todayWord')} · ` : ''}
              {dayLabel}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/dashboard/packing?date=${iso(addDays(day, -1))}`}
            className={btn.outlineSm}
            aria-label={tToday('prevDay')}
          >
            ←
          </Link>
          <Link
            href="/dashboard/packing"
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              isToday ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-surface-hover'
            }`}
          >
            {t('todayWord')}
          </Link>
          <Link
            href={`/dashboard/packing?date=${iso(addDays(day, 1))}`}
            className={btn.outlineSm}
            aria-label={tToday('nextDay')}
          >
            →
          </Link>
        </div>
      </div>

      {totals.total > 0 && (
        <p className="text-sm text-muted">
          {t('packedOf', { done: totals.done, total: totals.total })}
          {totals.missing > 0 && (
            <span className="ml-2 text-red-700 dark:text-red-400">
              · {t('missingCount', { count: totals.missing })}
            </span>
          )}
        </p>
      )}

      {entries.length === 0 ? (
        <p className={`${card} p-6 text-sm text-muted`}>{t('noEntriesToday')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {entries.map((e) => {
            const items = e.project.items
            const done = items.filter((i) => i.status === 'COLLECTED').length
            const missing = items.filter((i) => i.status === 'MISSING').length
            return (
              <section key={e.id} className={card}>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/projects/${e.project.id}`}
                      className="font-semibold text-accent hover:underline"
                    >
                      {e.project.number} — {e.project.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {e.project.customer.name}
                      {e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}
                      {e.vehicles.length > 0 ? ` · ${e.vehicles.map((v) => v.vehicle.name).join(', ')}` : ''}
                    </p>
                    <p className="text-xs text-muted">
                      {e.employees
                        .map((x) => `${x.employee.firstName} ${x.employee.lastName}`.trim())
                        .join(', ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/projects/${e.project.id}/sheet?entry=${e.id}`}
                      title={tSheet('title')}
                      aria-label={tSheet('title')}
                      className="rounded-md border border-border p-1.5 text-muted hover:bg-surface-hover hover:text-foreground"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                      </svg>
                    </Link>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                        items.length === 0
                          ? 'bg-surface-hover text-muted'
                          : missing > 0
                            ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                            : done === items.length
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {items.length === 0
                        ? t('noItems')
                        : done === items.length
                          ? t('allPacked')
                          : t('packedOf', { done, total: items.length })}
                    </span>
                  </div>
                </div>
                {items.length > 0 && (
                  <ul className="divide-y divide-border">
                    {items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-1.5 text-sm">
                        <span>
                          {it.catalogItem.name}
                          {it.quantity != null && (
                            <span className="ml-2 text-xs text-muted">
                              {Number(it.quantity)}
                              {it.catalogItem.unit ? ` ${it.catalogItem.unit}` : ''}
                            </span>
                          )}
                          {it.status !== 'COLLECTED' && (
                            <span className="ml-2">
                              <StockWarning
                                needed={it.quantity != null ? Number(it.quantity) : null}
                                stock={it.catalogItem.stockQuantity != null ? Number(it.catalogItem.stockQuantity) : null}
                                unit={it.catalogItem.unit}
                              />
                            </span>
                          )}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[it.status] ?? ''}`}
                        >
                          {tItem(it.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
