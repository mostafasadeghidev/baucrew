import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { requireUser } from '@/lib/authz'
import { db } from '@/lib/db'
import { addDays, iso, todayUtc, utcDate } from '@/lib/dates'
import { StockWarning } from '@/components/stock-warning'
import { btn } from '@/components/ui/button'

const ITEM_STYLE: Record<'REQUIRED' | 'COLLECTED' | 'MISSING', string> = {
  REQUIRED: 'border-border text-muted',
  COLLECTED: 'border-emerald-600/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  MISSING: 'border-red-600/50 bg-red-500/10 text-red-700 dark:text-red-400',
}

export default async function MyAreaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const user = await requireUser()
  const { date } = await searchParams
  const [t, tSheet, tItem, locale] = await Promise.all([
    getTranslations('my'),
    getTranslations('sheet'),
    getTranslations('itemStatus'),
    getLocale(),
  ])

  const today = todayUtc()
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? utcDate(date) : today
  const isToday = iso(day) === iso(today)
  const employeeId = user.employee?.id

  const [entries, next] = employeeId
    ? await Promise.all([
        db.scheduleEntry.findMany({
          where: { date: day, cancelledAt: null, employees: { some: { employeeId } } },
          include: {
            project: {
              include: {
                customer: { select: { name: true, phone: true, contactPerson: true } },
                manager: { select: { firstName: true, lastName: true, phone: true } },
                items: {
                  include: { catalogItem: { select: { name: true, unit: true, stockQuantity: true } } },
                  orderBy: { catalogItem: { name: 'asc' } },
                },
              },
            },
            vehicles: { include: { vehicle: { select: { name: true } } } },
            employees: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
          },
          orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
        }),
        // Next assignment strictly after the shown day (30-day horizon)
        db.scheduleEntry.findFirst({
          where: {
            date: { gt: day, lte: addDays(day, 30) },
            cancelledAt: null,
            employees: { some: { employeeId } },
          },
          include: {
            project: { select: { id: true, name: true, city: true } },
            vehicles: { include: { vehicle: { select: { name: true } } } },
          },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        }),
      ])
    : [[], null]

  const displayName = user.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
    : user.username

  const fmtLong = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const fmtShort = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

  const dayLink = (d: Date, label: string, active = false) => (
    <Link
      href={iso(d) === iso(today) ? '/my' : `/my?date=${iso(d)}`}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
        active
          ? 'border-accent bg-accent text-accent-foreground'
          : 'border-border hover:bg-surface-hover'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">
            {t('greeting', { name: displayName })}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{fmtLong.format(day)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {dayLink(addDays(day, -1), '←')}
          {dayLink(today, t('today'), isToday)}
          {dayLink(addDays(day, 1), '→')}
        </div>
      </div>

      {!employeeId && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          {t('noEmployeeLinked')}
        </p>
      )}

      {/* Jobs of the day */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-muted">
          {isToday ? t('todaysJobs') : t('jobsOn', { date: fmtShort.format(day) })}
        </h2>

        {entries.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
            {isToday ? t('noJobsToday') : t('noJobsOn')}
          </div>
        ) : (
          entries.map((entry) => {
            const p = entry.project
            const address = [p.street, [p.postalCode, p.city].filter(Boolean).join(' ')]
              .filter(Boolean)
              .join(', ')
            const phone = p.phone ?? p.customer.phone
            const contact = p.contact ?? p.customer.contactPerson
            const done = p.items.filter((i) => i.status === 'COLLECTED').length
            const time = [entry.startTime, entry.endTime].filter(Boolean).join('–')
            const teammates = entry.employees.filter((ee) => ee.employee.id !== employeeId)

            return (
              <article
                key={entry.id}
                className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
              >
                {/* Title row */}
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-tight md:text-xl">{p.name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {p.customer.name}
                      {time && <> · <span className="tabular-nums">{time}</span></>}
                    </p>
                  </div>
                  <Link
                    href={`/projects/${p.id}/sheet?entry=${entry.id}`}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-accent px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent hover:text-accent-foreground"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    {tSheet('title')}
                  </Link>
                </div>

                {/* Facts */}
                <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2">
                  {address && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-muted">{t('address')}</dt>
                      <dd className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium">{address}</span>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${btn.outlineSm} px-2 py-1 text-xs text-accent`}
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
                            <circle cx="12" cy="10" r="2.5" />
                          </svg>
                          {t('openInMaps')}
                        </a>
                      </dd>
                    </div>
                  )}
                  {(phone || contact) && (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted">{t('phone')}</dt>
                      <dd className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {contact && <span className="font-medium">{contact}</span>}
                        {phone && (
                          <a
                            href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                            className={`${btn.outlineSm} px-2 py-1 text-xs text-accent`}
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
                            </svg>
                            {phone}
                          </a>
                        )}
                      </dd>
                    </div>
                  )}
                  {p.manager && (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted">{t('manager')}</dt>
                      <dd className="mt-0.5 font-medium">
                        {p.manager.firstName} {p.manager.lastName}
                        {p.manager.phone && (
                          <a href={`tel:${p.manager.phone.replace(/[^\d+]/g, '')}`} className="ml-2 text-xs text-accent hover:underline">
                            {p.manager.phone}
                          </a>
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">{t('vehicle')}</dt>
                    <dd className="mt-0.5 font-medium">
                      {entry.vehicles.map((ev) => ev.vehicle.name).join(', ') || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">{t('team')}</dt>
                    <dd className="mt-0.5 font-medium">
                      {teammates.length === 0
                        ? '—'
                        : teammates.map((ee) => `${ee.employee.firstName} ${ee.employee.lastName}`.trim()).join(', ')}
                    </dd>
                  </div>
                  {p.description && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-muted">{t('description')}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap">{p.description}</dd>
                    </div>
                  )}
                </dl>

                {/* Items */}
                <div className="border-t border-border px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wide text-muted">{t('items')}</p>
                    {p.items.length > 0 && (
                      <p className={`text-xs font-medium ${done === p.items.length ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted'}`}>
                        {t('packedOf', { done, total: p.items.length })}
                      </p>
                    )}
                  </div>
                  {p.items.length === 0 ? (
                    <p className="mt-1 text-sm text-muted">{t('noItems')}</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {p.items.map((item) => (
                        <li
                          key={item.id}
                          className={`rounded-md border px-2 py-1 text-xs font-medium ${ITEM_STYLE[item.status]}`}
                          title={tItem(item.status)}
                        >
                          {item.status === 'COLLECTED' && '✓ '}
                          {item.status === 'MISSING' && '! '}
                          {item.catalogItem.name}
                          {item.quantity != null && (
                            <span className="opacity-70">
                              {' '}
                              {Number(item.quantity)}
                              {item.catalogItem.unit ? ` ${item.catalogItem.unit}` : ''}
                            </span>
                          )}
                          {item.status !== 'COLLECTED' && (
                            <span className="ml-1">
                              <StockWarning
                                needed={item.quantity != null ? Number(item.quantity) : null}
                                stock={item.catalogItem.stockQuantity != null ? Number(item.catalogItem.stockQuantity) : null}
                                unit={item.catalogItem.unit}
                              />
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            )
          })
        )}
      </section>

      {/* Next job */}
      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted">{t('nextJob')}</p>
        {next ? (
          <Link href={`/my?date=${iso(next.date)}`} className="mt-1 block hover:underline">
            <span className="font-semibold">{fmtShort.format(next.date)}</span>
            {next.startTime && <span className="tabular-nums text-muted"> · {next.startTime}</span>}
            <span> · {next.project.name}</span>
            {next.project.city && <span className="text-muted"> · {next.project.city}</span>}
            {next.vehicles.length > 0 && (
              <span className="text-muted"> · {next.vehicles.map((v) => v.vehicle.name).join(', ')}</span>
            )}
          </Link>
        ) : (
          <p className="mt-1 text-sm text-muted">{t('noNextJob')}</p>
        )}
      </section>
    </div>
  )
}
