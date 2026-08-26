import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { requireUser } from '@/lib/authz'
import { db } from '@/lib/db'
import { addDays, iso, mondayOf, isoWeek, todayUtc, utcDate } from '@/lib/dates'
import { btn } from '@/components/ui/button'
import { PackingList } from './packing-buttons'
import { Checklist } from '@/components/checklist'
import { WeekStrip, buildWeek } from './week-strip'
import { formatDate } from '@/lib/format'
import { MapPin, Paperclip, Phone, Printer, Truck, Users } from 'lucide-react'
import { formatMinutes, LATE_ENTRY_DAYS, sumMinutes } from '@/lib/time-entries'
import { TimeClock } from './time-clock'
import { TimeLate } from './time-late'

/**
 * The worker's own day on the phone: week strip, one card per assignment with
 * address, contacts, the note for that day, the packing list and the site
 * checklists — everything tappable, nothing that looks like a printed sheet.
 */
export default async function MyAreaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const user = await requireUser()
  const { date } = await searchParams
  const [t, tSheet, tChecklists, tFiles, tTime, tToday, locale] = await Promise.all([
    getTranslations('my'),
    getTranslations('sheet'),
    getTranslations('checklists'),
    getTranslations('files'),
    getTranslations('time'),
    getTranslations('today'),
    getLocale(),
  ])

  const today = todayUtc()
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? utcDate(date) : today
  const isToday = iso(day) === iso(today)
  // A forgotten booking can be added for today and the last few days.
  const daysBack = Math.round((today.getTime() - day.getTime()) / 86_400_000)
  const canAddLate = daysBack >= 0 && daysBack <= LATE_ENTRY_DAYS
  const employeeId = user.employee?.id
  const monday = mondayOf(day)

  const [entries, next, weekEntries, openTime, todayTime] = employeeId
    ? await Promise.all([
        db.scheduleEntry.findMany({
          where: { date: day, cancelledAt: null, employees: { some: { employeeId } } },
          include: {
            project: {
              include: {
                customer: { select: { name: true, phone: true, contactPerson: true } },
                manager: { select: { firstName: true, lastName: true, phone: true } },
                items: {
                  include: { catalogItem: { select: { name: true, unit: true, stockQuantity: true, videoUrl: true } } },
                  orderBy: { catalogItem: { name: 'asc' } },
                },
                documents: {
                  where: { visibleToCrew: true },
                  select: { id: true, filename: true },
                  orderBy: { createdAt: 'asc' },
                },
                checklists: {
                  orderBy: { createdAt: 'asc' },
                  include: {
                    items: {
                      orderBy: { sortOrder: 'asc' },
                      include: { checkedBy: { select: { firstName: true, lastName: true } } },
                    },
                  },
                },
              },
            },
            vehicles: { include: { vehicle: { select: { name: true } } } },
            employees: {
              include: { employee: { select: { id: true, firstName: true, lastName: true, phone: true } } },
            },
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
        // Dots for the week strip
        db.scheduleEntry.findMany({
          where: {
            date: { gte: monday, lt: addDays(monday, 7) },
            cancelledAt: null,
            employees: { some: { employeeId } },
          },
          select: { date: true },
        }),
        // Time clock: the still-running interval + everything booked today
        db.timeEntry.findFirst({
          where: { employeeId, endedAt: null },
          select: { projectId: true, startedAt: true },
        }),
        db.timeEntry.findMany({
          where: {
            employeeId,
            startedAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) },
          },
          select: { startedAt: true, endedAt: true },
        }),
      ])
    : [[], null, [], null, []]

  const jobsPerDay = new Map<string, number>()
  for (const e of weekEntries) {
    const key = iso(e.date)
    jobsPerDay.set(key, (jobsPerDay.get(key) ?? 0) + 1)
  }

  const intl = locale === 'en' ? 'en-GB' : 'de-DE'
  const fmtLong = new Intl.DateTimeFormat(intl, {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
  const fmtShort = new Intl.DateTimeFormat(intl, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
  const weekdayFmt = new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: 'UTC' })
  const week = buildWeek(monday, day, today, jobsPerDay, weekdayFmt)

  const todayMinutes = sumMinutes(todayTime, new Date())

  const tel = (v: string) => `tel:${v.replace(/[^\d+]/g, '')}`

  return (
    <div className="space-y-4">
      {/* Day + how much is on it */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">
          {isToday ? t('today') : fmtLong.format(day)}
          {isToday && <span className="ml-2 text-base font-medium text-muted">{fmtLong.format(day)}</span>}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {entries.length === 0 ? t('noJobsShort') : t('jobsCount', { count: entries.length })}
          {isToday && todayMinutes > 0 && (
            <span className="ml-2 font-medium text-foreground">
              · {tTime('todayTotal', { hours: formatMinutes(todayMinutes) })}
            </span>
          )}
        </p>
      </div>

      <WeekStrip
        days={week}
        prevWeek={addDays(monday, -7)}
        nextWeek={addDays(monday, 7)}
        weekLabel={`KW ${isoWeek(monday)}`}
      />

      {/* The shared warehouse login has no own assignments — send it to the screen */}
      {!employeeId && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm">{t('noEmployeeLinked')}</p>
          <Link href="/today" className={`${btn.primary} mt-3`}>
            {tToday('title')}
          </Link>
        </section>
      )}

      {employeeId && entries.length === 0 && (
        <section className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-base text-muted">{isToday ? t('noJobsToday') : t('noJobsOn')}</p>
        </section>
      )}

      {entries.map((entry) => {
        const p = entry.project
        const address = [p.street, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
        const phone = p.phone ?? p.customer.phone
        const contact = p.contact ?? p.customer.contactPerson
        const done = p.items.filter((i) => i.status === 'COLLECTED').length
        const time = [entry.startTime, entry.endTime].filter(Boolean).join('–')
        // Neither myself nor the site manager (shown separately) in the crew line
        const teammates = entry.employees.filter(
          (ee) => ee.employee.id !== employeeId && ee.employee.id !== p.managerId
        )

        return (
          <article
            id={`p-${p.id}`}
            key={entry.id}
            className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
          >
            {/* Headline: time first — that is what the crew looks for */}
            <div className="border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {time && <span className="text-lg font-bold tabular-nums text-accent">{time}</span>}
                <h2 className="text-lg font-semibold leading-tight">{p.name}</h2>
              </div>
              <p className="mt-0.5 text-sm text-muted">{p.customer.name}</p>
            </div>

            {/* Note of this very day — the message that used to get lost */}
            {entry.note && (
              <p className="border-b border-border bg-amber-500/10 px-4 py-3 text-sm font-medium">
                {entry.note}
              </p>
            )}

            {/* Big actions */}
            <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
              {address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${btn.primary} flex-1 justify-center`}
                >
                  <MapPin className="h-4 w-4" aria-hidden />
                  {t('navigate')}
                </a>
              )}
              {phone && (
                <a href={tel(phone)} className={`${btn.outline} flex-1 justify-center`}>
                  <Phone className="h-4 w-4" aria-hidden />
                  {t('call')}
                </a>
              )}
              <Link
                href={`/projects/${p.id}/sheet?entry=${entry.id}`}
                className={`${btn.outline} flex-1 justify-center`}
              >
                <Printer className="h-4 w-4" aria-hidden />
                {tSheet('title')}
              </Link>
            </div>

            {/* Time clock — start when work begins, stop when it ends.
                Older days (and a forgotten start today) are added by hand. */}
            {(isToday || canAddLate) && (
              <div className="space-y-2 border-t border-border px-4 py-3">
                {isToday && (
                  <TimeClock
                    projectId={p.id}
                    runningSince={
                      openTime?.projectId === p.id ? openTime.startedAt.toISOString() : null
                    }
                  />
                )}
                {canAddLate && <TimeLate projectId={p.id} date={iso(day)} />}
              </div>
            )}

            {/* Facts: address, people, vehicle */}
            <dl className="space-y-2.5 px-4 py-3 text-sm">
              {address && (
                <div className="flex gap-2">
                  <dt className="shrink-0 pt-0.5 text-muted">
                    <MapPin className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{t('address')}</span>
                  </dt>
                  <dd className="font-medium">{address}</dd>
                </div>
              )}
              {(contact || phone) && (
                <div className="flex gap-2">
                  <dt className="shrink-0 pt-0.5 text-muted">
                    <Phone className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{t('phone')}</span>
                  </dt>
                  <dd>
                    {contact && <span className="font-medium">{contact}</span>}
                    {phone && (
                      <a href={tel(phone)} className="ml-2 text-accent hover:underline">
                        {phone}
                      </a>
                    )}
                  </dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="shrink-0 pt-0.5 text-muted">
                  <Truck className="h-4 w-4" aria-hidden />
                  <span className="sr-only">{t('vehicle')}</span>
                </dt>
                <dd className="font-medium">{entry.vehicles.map((ev) => ev.vehicle.name).join(', ') || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 pt-0.5 text-muted">
                  <Users className="h-4 w-4" aria-hidden />
                  <span className="sr-only">{t('team')}</span>
                </dt>
                <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {p.manager && (
                    <span className="font-medium">
                      {p.manager.firstName} {p.manager.lastName}
                      <span className="ml-1 text-xs text-muted">({t('manager')})</span>
                      {p.manager.phone && (
                        <a href={tel(p.manager.phone)} className="ml-1.5 text-accent hover:underline">
                          {p.manager.phone}
                        </a>
                      )}
                    </span>
                  )}
                  {teammates.length === 0 && !p.manager && <span>—</span>}
                  {/* Team-mates are tappable too — calling a colleague is normal on site */}
                  {teammates.map((ee) =>
                    ee.employee.phone ? (
                      <a key={ee.employee.id} href={tel(ee.employee.phone)} className="text-accent hover:underline">
                        {ee.employee.firstName} {ee.employee.lastName}
                      </a>
                    ) : (
                      <span key={ee.employee.id}>
                        {ee.employee.firstName} {ee.employee.lastName}
                      </span>
                    )
                  )}
                </dd>
              </div>
              {p.description && (
                <div className="border-t border-border pt-2.5">
                  <dt className="text-xs uppercase tracking-wide text-muted">{t('description')}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap">{p.description}</dd>
                </div>
              )}
            </dl>

            {/* Packing list */}
            <div className="border-t border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted">{t('items')}</p>
                {p.items.length > 0 && (
                  <p
                    className={`text-xs font-medium ${
                      done === p.items.length ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted'
                    }`}
                  >
                    {t('packedOf', { done, total: p.items.length })}
                  </p>
                )}
              </div>
              {p.items.length === 0 ? (
                <p className="mt-1 text-sm text-muted">{t('noItems')}</p>
              ) : (
                /* Tap an item to tick it: required → packed → missing. */
                <PackingList
                  items={p.items.map((item) => ({
                    id: item.id,
                    name: item.catalogItem.name,
                    unit: item.catalogItem.unit,
                    quantity: item.quantity != null ? Number(item.quantity) : null,
                    status: item.status,
                    videoUrl: item.catalogItem.videoUrl,
                  }))}
                />
              )}
            </div>

            {/* Documents the office shared with the crew (never with prices) */}
            {p.documents.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted">{tFiles('title')}</p>
                <ul className="mt-2 space-y-1.5">
                  {p.documents.map((doc) => (
                    <li key={doc.id}>
                      <a
                        href={`/api/files/${doc.id}`}
                        target="_blank"
                        className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
                      >
                        <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{doc.filename}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Site checklists — tick them off right here */}
            {p.checklists.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted">{tChecklists('title')}</p>
                <div className="mt-2 space-y-4">
                  {p.checklists.map((c) => (
                    <Checklist
                      key={c.id}
                      compact
                      checklist={{
                        id: c.id,
                        name: c.name,
                        items: c.items.map((i) => ({
                          id: i.id,
                          text: i.text,
                          ok: i.ok,
                          note: i.note,
                          checkedBy: i.checkedBy
                            ? `${i.checkedBy.firstName} ${i.checkedBy.lastName}`.trim()
                            : null,
                          checkedAt: i.checkedAt ? formatDate(i.checkedAt, locale) : null,
                        })),
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </article>
        )
      })}

      {/* Next job */}
      {employeeId && (
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted">{t('nextJob')}</p>
          {next ? (
            <Link href={`/my?date=${iso(next.date)}`} className="mt-1 flex flex-wrap items-baseline gap-x-2 hover:underline">
              <span className="font-semibold">{fmtShort.format(next.date)}</span>
              {next.startTime && <span className="tabular-nums text-accent">{next.startTime}</span>}
              <span>{next.project.name}</span>
              {next.project.city && <span className="text-muted">· {next.project.city}</span>}
            </Link>
          ) : (
            <p className="mt-1 text-sm text-muted">{t('noNextJob')}</p>
          )}
        </section>
      )}
    </div>
  )
}
