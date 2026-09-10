import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { CloudRain, MapPin } from 'lucide-react'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { addDays, iso, mondayOf, todayUtc, utcDate } from '@/lib/dates'
import { getRainWarnings } from '@/lib/weather'
import { geocodeCity } from '@/lib/geocode'
import { ScheduleHeader } from '../schedule-header'
import { SiteMap, type MapSite } from './site-map'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * One colour per weekday, Monday first. A week puts five to seven days of pins
 * on one map at once, and shades of one colour stop telling each other apart —
 * so these are hues, far enough apart to survive both themes and the map's own
 * greens and greys underneath them.
 */
const DAY_COLORS = ['#7F77DD', '#378ADD', '#1D9E75', '#BA7517', '#D4537E', '#5F5E5A', '#65A30D']

export default async function ScheduleMapPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; day?: string; date?: string }>
}) {
  const [t, locale, sp] = await Promise.all([
    getTranslations('schedule'),
    getLocale(),
    searchParams,
  ])
  await requireManagement()

  // `date` is what the map took before it showed a week; a link or a bookmark
  // carrying one lands on that day, inside its week.
  const anchor =
    sp.week && ISO_RE.test(sp.week)
      ? utcDate(sp.week)
      : sp.date && ISO_RE.test(sp.date)
        ? utcDate(sp.date)
        : todayUtc()
  const monday = mondayOf(anchor)
  const weekEnd = addDays(monday, 7)
  const selectedDay =
    sp.day && ISO_RE.test(sp.day) && sp.day >= iso(monday) && sp.day < iso(weekEnd)
      ? sp.day
      : sp.date && ISO_RE.test(sp.date) && !sp.week
        ? sp.date
        : null

  const entries = await db.scheduleEntry.findMany({
    where: { date: { gte: monday, lt: weekEnd }, cancelledAt: null },
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
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { createdAt: 'asc' }],
  })

  // Rain for the whole week costs what one day costs: the weather module groups
  // its lookups by place, not by date.
  const rain = await getRainWarnings(
    entries
      .filter((e) => e.project.city)
      .map((e) => ({
        city: e.project.city!,
        date: iso(e.date),
        latitude: e.project.latitude,
        longitude: e.project.longitude,
      }))
  )
  const rainAt = new Map(rain.map((r) => [`${r.city}|${r.date}`, r.probability]))

  const addressOf = (p: (typeof entries)[number]['project']) =>
    [p.street, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  // Projects entered without picking a city suggestion have no coordinates —
  // fall back to the town centre, the same source the weather module uses. One
  // lookup per project, however many days it is planned for.
  type Located = { lat: number; lng: number; approx: boolean } | null
  const byProject = new Map<string, Promise<Located>>()
  for (const entry of entries) {
    const { id, latitude, longitude, city } = entry.project
    if (byProject.has(id)) continue
    byProject.set(
      id,
      latitude != null && longitude != null
        ? Promise.resolve({ lat: latitude, lng: longitude, approx: false })
        : city
          ? geocodeCity(city).then((hit) =>
              hit ? { lat: hit.latitude, lng: hit.longitude, approx: true } : null
            )
          : Promise.resolve(null)
    )
  }
  const located = new Map(
    await Promise.all([...byProject].map(async ([id, p]) => [id, await p] as const))
  )

  const dayFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
  const rangeFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

  /** The week, day by day; days with nothing planned are left out. */
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
    .map((date, weekday) => {
      const dateIso = iso(date)
      const dayEntries = entries.filter((e) => iso(e.date) === dateIso)
      const sites: MapSite[] = []
      const unlocated: typeof dayEntries = []
      const rows: Array<{
        entry: (typeof dayEntries)[number]
        site: MapSite
        approx: boolean
        rain: number | undefined
      }> = []
      for (const entry of dayEntries) {
        const hit = located.get(entry.project.id) ?? null
        if (!hit) {
          unlocated.push(entry)
          continue
        }
        const site: MapSite = {
          id: entry.id,
          index: sites.length + 1,
          name: entry.project.name,
          address: addressOf(entry.project) || entry.project.customer.name,
          dayLabel: dayFmt.format(date),
          color: DAY_COLORS[weekday],
          lat: hit.lat,
          lng: hit.lng,
        }
        sites.push(site)
        rows.push({
          entry,
          site,
          approx: hit.approx,
          rain: entry.project.city ? rainAt.get(`${entry.project.city}|${dateIso}`) : undefined,
        })
      }
      return {
        dateIso,
        label: dayFmt.format(date),
        color: DAY_COLORS[weekday],
        rows,
        unlocated,
        count: dayEntries.length,
      }
    })
    .filter((d) => d.count > 0)

  const shown = selectedDay ? days.filter((d) => d.dateIso === selectedDay) : days
  const sites = shown.flatMap((d) => d.rows.map((r) => r.site))

  const mapHref = (change: { monday?: Date; day?: string | null } = {}) => {
    const start = change.monday ?? monday
    const params = new URLSearchParams({ week: iso(start) })
    const day = change.day === undefined ? selectedDay : change.day
    if (day && !change.monday) params.set('day', day)
    return `/schedule/map?${params.toString()}`
  }
  const periodLabel = `${rangeFmt.format(monday)} – ${rangeFmt.format(addDays(monday, 6))}`

  return (
    <div className="space-y-4">
      <ScheduleHeader
        title={t('title')}
        view="map"
        weekHref={`/schedule?week=${iso(monday)}`}
        monthHref={`/schedule?view=month&week=${iso(monday)}`}
        mapHref={mapHref()}
        viewLabels={{ week: t('viewWeek'), month: t('viewMonth'), map: t('viewMap') }}
        periodLabel={periodLabel}
        prevHref={mapHref({ monday: addDays(monday, -7) })}
        nextHref={mapHref({ monday: addDays(monday, 7) })}
        currentHref={mapHref({ monday: mondayOf(todayUtc()) })}
        currentLabel={t('current')}
        prevLabel={t('prevWeek')}
        nextLabel={t('nextWeek')}
        toggles={[
          // Always drawn, whichever way it stands: a control that comes and
          // goes with the selection would move the row it sits in.
          selectedDay
            ? {
                href: mapHref({ day: null }),
                label: t('mapWholeWeek'),
                active: false,
                title: t('mapWholeWeekHint'),
              }
            : { href: null, label: t('mapWholeWeek'), active: true, title: t('mapWholeWeekOn') },
        ]}
      />

      {/* The map keeps its place whether the week is full or empty: swapping the
          whole body for a line of text would move everything under it. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-2">
          <SiteMap sites={sites} ariaLabel={t('viewMap')} />
          {days.length > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              {days.map((day) => (
                <span key={day.dateIso} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: day.color }}
                  />
                  {day.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {days.length === 0 && (
            <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
              {t('mapNoEntries')}
            </p>
          )}
          {days.map((day) => {
            const open = selectedDay === null || selectedDay === day.dateIso
            return (
              <div
                key={day.dateIso}
                className={`overflow-hidden rounded-lg border bg-surface ${
                  selectedDay === day.dateIso ? 'border-accent' : 'border-border'
                }`}
              >
                <Link
                  href={mapHref({ day: selectedDay === day.dateIso ? null : day.dateIso })}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-hover"
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: day.color }}
                  />
                  <span className="truncate">{day.label}</span>
                  <span className="ml-auto text-xs tabular-nums text-muted">{day.count}</span>
                </Link>

                {open && (
                  <ul className="divide-y divide-border border-t border-border">
                    {day.rows.map(({ entry, site, approx, rain: probability }) => (
                      <li key={entry.id} className="flex gap-3 px-3 py-2.5 text-sm">
                        <span
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ background: day.color }}
                        >
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
                    ))}
                    {day.unlocated.length > 0 && (
                      <li className="bg-amber-500/10 px-3 py-2.5 text-xs">
                        <p className="flex items-center gap-1.5 font-medium">
                          <MapPin className="h-4 w-4" aria-hidden />
                          {t('mapWithoutCoordinates')}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {day.unlocated.map((entry) => (
                            <li key={entry.id}>
                              <Link
                                href={`/projects/${entry.project.id}`}
                                className="text-accent hover:underline"
                              >
                                {entry.project.number} — {entry.project.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
