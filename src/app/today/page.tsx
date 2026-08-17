import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'
import { logout } from '@/app/actions'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { AutoRefresh } from './auto-refresh'
import { PackingList, type PackingItem } from './packing-list'

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function todayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

export default async function TodayBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireUser()
  const { date } = await searchParams
  const [t, tAuth, tSheet, locale] = await Promise.all([
    getTranslations('today'),
    getTranslations('auth'),
    getTranslations('sheet'),
    getLocale(),
  ])

  const day =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : todayUtc()
  const nextDay = new Date(day)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const prevDay = new Date(day)
  prevDay.setUTCDate(prevDay.getUTCDate() - 1)
  const isToday = iso(day) === iso(todayUtc())

  const entries = await db.scheduleEntry.findMany({
    where: { date: day },
    include: {
      project: {
        select: {
          id: true,
          number: true,
          name: true,
          street: true,
          postalCode: true,
          city: true,
          customer: { select: { name: true } },
          items: {
            include: { catalogItem: { select: { name: true, unit: true, stockQuantity: true } } },
            orderBy: { catalogItem: { name: 'asc' } },
          },
        },
      },
      vehicles: { include: { vehicle: { select: { name: true } } } },
      employees: { include: { employee: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  })

  const dateLabel = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(day)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <AutoRefresh />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-accent">{t('title')}</p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {dateLabel}
            {isToday && (
              <span className="ml-3 align-middle text-lg font-semibold text-muted">
                ({t('today')})
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/today?date=${iso(prevDay)}`}
            title={t('prevDay')}
            className="flex h-12 w-12 items-center justify-center rounded-lg border border-border text-xl hover:bg-surface-hover"
          >
            ←
          </Link>
          <Link
            href="/today"
            className="flex h-12 items-center rounded-lg border border-border px-4 text-lg font-medium hover:bg-surface-hover"
          >
            {t('today')}
          </Link>
          <Link
            href={`/today?date=${iso(nextDay)}`}
            title={t('nextDay')}
            className="flex h-12 w-12 items-center justify-center rounded-lg border border-border text-xl hover:bg-surface-hover"
          >
            →
          </Link>
          <div className="ml-2 flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-border px-4 py-2.5 text-base hover:bg-surface-hover"
              >
                {tAuth('logout')}
              </button>
            </form>
          </div>
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-16 text-center text-2xl text-muted">
          {t('noJobs')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {entries.map((entry) => {
            const address = [
              entry.project.street,
              [entry.project.postalCode, entry.project.city].filter(Boolean).join(' '),
            ]
              .filter(Boolean)
              .join(', ')
            const items: PackingItem[] = entry.project.items.map((item) => ({
              id: item.id,
              name: item.catalogItem.name,
              unit: item.catalogItem.unit,
              quantity: item.quantity != null ? Number(item.quantity) : null,
              stock: item.catalogItem.stockQuantity != null ? Number(item.catalogItem.stockQuantity) : null,
              status: item.status,
            }))
            return (
              <section
                key={entry.id}
                className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
              >
                <div className="border-b border-border bg-accent/10 px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-3xl font-bold tracking-tight text-accent">
                      {entry.vehicles.map((ev) => ev.vehicle.name).join(' + ') || '—'}
                    </h2>
                    {entry.startTime && (
                      <span className="text-xl font-semibold tabular-nums">
                        {t('start')}: {entry.startTime}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xl font-semibold">
                    {entry.employees
                      .map((ee) => `${ee.employee.firstName} ${ee.employee.lastName}`.trim())
                      .join(' + ')}
                  </p>
                </div>
                <div className="space-y-1 border-b border-border px-5 py-4 text-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-2xl font-bold">{entry.project.name}</p>
                    <Link
                      href={`/projects/${entry.project.id}/sheet`}
                      className="flex items-center gap-2 rounded-lg border-2 border-accent px-4 py-2.5 text-lg font-semibold text-accent hover:bg-accent hover:text-accent-foreground"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                      </svg>
                      {tSheet('title')}
                    </Link>
                  </div>
                  <p>
                    <span className="text-muted">{t('customer')}: </span>
                    <span className="font-semibold">{entry.project.customer.name}</span>
                  </p>
                  {address && (
                    <p>
                      <span className="text-muted">{t('address')}: </span>
                      <span className="font-semibold">{address}</span>
                    </p>
                  )}
                  {entry.note && <p className="text-muted">{entry.note}</p>}
                </div>
                <PackingList items={items} />
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
