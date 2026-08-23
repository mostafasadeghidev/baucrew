import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { CloudRain, MapPin } from 'lucide-react'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { addDays, iso, todayUtc, utcDate } from '@/lib/dates'
import { getRainWarnings } from '@/lib/weather'
import { geocodeCity } from '@/lib/geocode'
import { btn } from '@/components/ui/button'
import { DayMap, type MapSite } from './day-map'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function ScheduleMapPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const [t, locale, sp] = await Promise.all([
    getTranslations('schedule'),
    getLocale(),
    searchParams,
  ])
  await requireManagement()

  const today = todayUtc()
  const date = sp.date && ISO_RE.test(sp.date) ? utcDate(sp.date) : today
  const dateIso = iso(date)

  const entries = await db.scheduleEntry.findMany({
    where: { date, cancelledAt: null },
    include: {
      project: {
        select: {
          id: true,
          number: true,
          name: true,
          street: true,
          postalCode: true,
          city: true,
          latitude: true,
          longitude: true,
          customer: { select: { name: true } },
        },
      },
      employees: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
      vehicles: { include: { vehicle: { select: { id: true, name: true } } } },
    },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  })

  // Rain per site for this day — the same source the planner already uses.
  const rain = await getRainWarnings(
    entries
      .filter((e) => e.project.city)
      .map((e) => ({
        city: e.project.city!,
        date: dateIso,
        latitude: e.project.latitude,
        longitude: e.project.longitude,
      }))
  )
  const rainByCity = new Map(rain.map((r) => [r.city, r.probability]))

  const addressOf = (p: (typeof entries)[number]['project']) =>
    [p.street, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  // Projects entered without picking a city suggestion have no coordinates —
  // fall back to the town centre, the same source the weather module uses.
  const resolved = await Promise.all(
    entries.map(async (entry) => {
      const { latitude, longitude, city } = entry.project
      if (latitude != null && longitude != null) return { entry, lat: latitude, lng: longitude, approx: false }
      const hit = city ? await geocodeCity(city) : null
      return hit
        ? { entry, lat: hit.latitude, lng: hit.longitude, approx: true }
        : { entry, lat: null, lng: null, approx: false }
    })
  )

  const located: Array<{ entry: (typeof entries)[number]; site: MapSite; approx: boolean }> = []
  const unlocated: typeof entries = []
  for (const r of resolved) {
    if (r.lat == null || r.lng == null) {
      unlocated.push(r.entry)
      continue
    }
    located.push({
      entry: r.entry,
      approx: r.approx,
      site: {
        id: r.entry.id,
        index: located.length + 1,
        name: r.entry.project.name,
        address: addressOf(r.entry.project) || r.entry.project.customer.name,
        lat: r.lat,
        lng: r.lng,
      },
    })
  }

  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const step = (days: number) => `/schedule/map?date=${iso(addDays(date, days))}`
  const tab = 'rounded-md px-3 py-1 text-muted transition-colors hover:text-foreground'
  const weekHref = `/schedule?week=${dateIso}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <span className="text-lg font-medium text-muted">{dateFmt.format(date)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-subtle p-1 text-sm font-medium">
            <Link href={weekHref} className={tab}>
              {t('viewWeek')}
            </Link>
            <Link href={`/schedule?view=month&week=${dateIso}`} className={tab}>
              {t('viewMonth')}
            </Link>
            <Link href={`/schedule?view=overview&week=${dateIso}`} className={tab}>
              {t('viewOverview')}
            </Link>
            <span className="rounded-md bg-surface px-3 py-1 text-foreground shadow-sm">
              {t('viewMap')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Link href={step(-1)} className={btn.outlineSm} aria-label={t('previousDay')}>
              ←
            </Link>
            <Link href="/schedule/map" className={btn.outlineSm}>
              {t('todayButton')}
            </Link>
            <Link href={step(1)} className={btn.outlineSm} aria-label={t('nextDay')}>
              →
            </Link>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {t('mapNoEntries')}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <DayMap sites={located.map((l) => l.site)} ariaLabel={t('viewMap')} />

          <div className="space-y-3">
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {located.map(({ entry, site, approx }) => {
                const probability = entry.project.city ? rainByCity.get(entry.project.city) : undefined
                return (
                  <li key={entry.id} className="flex gap-3 px-3 py-2.5 text-sm">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                      {site.index}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        {(entry.startTime || entry.endTime) && (
                          <span className="tabular-nums text-xs text-muted">
                            {[entry.startTime, entry.endTime].filter(Boolean).join('–')}
                          </span>
                        )}
                        <Link
                          href={`/projects/${entry.project.id}`}
                          className="truncate font-medium text-accent hover:underline"
                        >
                          {entry.project.name}
                        </Link>
                      </div>
                      <p className="truncate text-xs text-muted">
                        {site.address}
                        {approx && ` · ${t('mapApproximate')}`}
                      </p>
                      <p className="mt-1 text-xs">
                        {entry.employees
                          .map((ee) => `${ee.employee.firstName} ${ee.employee.lastName}`.trim())
                          .join(', ') || '—'}
                        {entry.vehicles.length > 0 &&
                          ` · ${entry.vehicles.map((ev) => ev.vehicle.name).join(', ')}`}
                      </p>
                      {probability != null && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400">
                          <CloudRain className="h-3.5 w-3.5" aria-hidden />
                          {probability}%
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            {unlocated.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <MapPin className="h-4 w-4" aria-hidden />
                  {t('mapWithoutCoordinates')}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {unlocated.map((entry) => (
                    <li key={entry.id}>
                      <Link href={`/projects/${entry.project.id}`} className="text-accent hover:underline">
                        {entry.project.number} — {entry.project.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
