import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { ExternalLink } from 'lucide-react'
import { formatCurrency, formatDate, formatDateTime, formatOfficeDate, officeDaysAgo } from '@/lib/format'
import { LAST_SEEN_TRIGGERS, mapUrl, whereName, type WattroDetails } from '@/lib/wattro/details'
import { DeviceMap } from './device-map'
import { WhereIcon } from './wattro-where'

/**
 * A machine Wattro keeps, on its own page — nothing but what Wattro says,
 * read-only; the next sync replaces all of it, and changes are made in
 * Wattro. Hand-outs, history and this app's own fields are not offered for
 * such a machine: Wattro is where the crews hand them out.
 *
 * One panel, read from the top: where it is and when it was last seen, then
 * what it is, who it belongs to and what is due, then the map of its last
 * position. A row Wattro left empty is not drawn, nor a group without rows.
 */
/** Up to this many days "Zuletzt gesehen" says "vor n Tagen"; the device list counts the same. */
export const RELATIVE_DAYS = 30

export async function WattroDevice({
  details,
  owned,
  locale,
  showPrice,
}: {
  details: WattroDetails
  /** The fields Wattro owns live on the device row itself. */
  owned: { inventoryNo: string | null; storageLocation: string | null; active: boolean }
  locale: string
  /** The purchase price is money: only for who may see prices. */
  showPrice: boolean
}) {
  const [t, tc] = await Promise.all([getTranslations('devices'), getTranslations('common')])
  const at = (iso: string | null) => (iso ? formatDateTime(new Date(iso), locale) : null)
  const day = (iso: string | null) => (iso ? formatOfficeDate(new Date(iso), locale) : null)
  const price = showPrice && details.price !== null ? Number(details.price) : null
  const seen = details.lastSeen
  const where = details.where
  const triggers = new Set<string>(LAST_SEEN_TRIGGERS)
  const trigger = seen?.trigger
    ? triggers.has(seen.trigger)
      ? t(`triggers.${seen.trigger}` as 'triggers.SCAN_EPC')
      : seen.trigger
    : null
  const seenBy = seen
    ? (seen.byEmployee ?? (seen.byTerminal !== null ? t('terminal', { id: seen.byTerminal }) : null))
    : null
  const unknown = {
    unknownEmployee: (id: number) => t('unknownEmployee', { id }),
    unknownProject: (id: number) => t('unknownProject', { id }),
    unknownStore: (id: number) => t('unknownStore', { id }),
  }
  const whereLine = [
    where?.since && t('whereSince', { date: day(where.since) ?? '' }),
    where?.kind === 'project' ? where.address : owned.storageLocation,
  ].filter(Boolean)

  const groups: Array<{ title: string; rows: Array<[string, ReactNode]> }> = [
    {
      title: t('wattroSectionDevice'),
      rows: [
        [t('inventoryNo'), owned.inventoryNo && <span className="tabular-nums">{owned.inventoryNo}</span>],
        [t('brand'), details.brand],
        [t('model'), details.model],
        [t('serialNumber'), details.serialNumber && <span className="tabular-nums">{details.serialNumber}</span>],
        // A calendar day, not a moment: read as UTC midnight like every date here.
        [t('purchasedAt'), details.purchasedAt && formatDate(new Date(`${details.purchasedAt}T00:00:00Z`), locale)],
        [t('price'), price !== null && Number.isFinite(price) ? formatCurrency(price, locale) : null],
        [t('gps'), details.gps ? t('gpsOn') : t('gpsOff')],
        [
          t('nameplate'),
          details.nameplateImage && (
            <a href={details.nameplateImage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
              {t('nameplateOpen')}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ),
        ],
      ],
    },
    {
      title: t('wattroSectionHome'),
      rows: [
        [t('homeStore'), details.homeStore],
        [t('homeEmployee'), details.homeEmployee],
      ],
    },
    {
      title: t('wattroSectionDates'),
      rows: [
        [t('inspection'), day(details.inspectionAt)],
        [t('reservedUntil'), day(details.reservationEndAt)],
      ],
    },
  ]
  const shown = groups
    .map((g) => ({ ...g, rows: g.rows.filter(([, value]) => value !== null && value !== undefined && value !== '') }))
    .filter((g) => g.rows.length > 0)

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* Where it is, and when Wattro last saw it — the two questions asked first */}
      <div className="grid gap-4 border-b border-border px-5 py-4 sm:grid-cols-2">
        <div className="min-w-0">
          <h2 className="text-xs font-medium text-muted">{t('whereNow')}</h2>
          <p className="mt-1 flex items-center gap-2 text-base font-semibold">
            <WhereIcon
              kind={where?.kind ?? 'store'}
              label={t(where?.kind === 'employee' ? 'whereEmployee' : where?.kind === 'project' ? 'whereProject' : 'whereStore')}
            />
            <span className={`min-w-0 truncate ${where ? '' : 'text-muted'}`}>{where ? whereName(where, unknown) : t('wattroUnassigned')}</span>
            {!owned.active && (
              <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-normal text-muted">{tc('inactive')}</span>
            )}
          </p>
          {whereLine.length > 0 && <p className="mt-0.5 pl-6 text-sm text-muted">{whereLine.join(' · ')}</p>}
          {where?.finished && (
            <p className="mt-1 pl-6 text-sm text-amber-700 dark:text-amber-400">{t('projectFinishedHint')}</p>
          )}
        </div>
        <div className="min-w-0 sm:text-right">
          <h2 className="text-xs font-medium text-muted">{t('lastSeen')}</h2>
          {seen ? (
            <>
              {/* "vor 12 Tagen" reads at a glance; past a month the date says more. */}
              {officeDaysAgo(new Date(seen.at), new Date()) <= RELATIVE_DAYS ? (
                <p className="mt-1 text-base font-semibold">
                  {t('seenDaysAgo', { days: officeDaysAgo(new Date(seen.at), new Date()) })}
                  <span className="ml-1.5 text-sm font-normal text-muted">{at(seen.at)}</span>
                </p>
              ) : (
                <p className="mt-1 text-base font-semibold">{at(seen.at)}</p>
              )}
              <p className="mt-0.5 text-sm text-muted">{[trigger, seenBy].filter(Boolean).join(' · ')}</p>
            </>
          ) : (
            <p className="mt-1 text-base font-semibold text-muted">—</p>
          )}
        </div>
      </div>

      {shown.length > 0 && (
        <div className="grid gap-x-10 gap-y-5 px-5 py-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((group) => (
            <div key={group.title}>
              <h3 className="mb-1.5 text-xs font-medium text-muted">{group.title}</h3>
              <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
                {group.rows.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted">{label}</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {details.notes && (
            <div className="sm:col-span-2 xl:col-span-3">
              <h3 className="mb-1.5 text-xs font-medium text-muted">{t('wattroNotes')}</h3>
              <p className="whitespace-pre-line text-sm">{details.notes}</p>
            </div>
          )}
        </div>
      )}

      {details.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 border-t border-border px-5 py-3" aria-label={t('tags')}>
          {details.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {details.position && (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
            <h3 className="text-sm font-semibold">
              {t('position')}
              {/* Usually the scan last seen set the position too; its time is then said once, above. */}
              {details.position.at && at(details.position.at) !== (seen && at(seen.at)) && (
                <span className="ml-1.5 font-normal text-muted">{t('positionAt', { time: at(details.position.at) ?? '' })}</span>
              )}
            </h3>
            <a
              href={mapUrl(details.position)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              {t('openMap')}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
          <DeviceMap lat={details.position.lat} lng={details.position.lng} label={t('position')} className="h-72 lg:h-80" />
        </div>
      )}

      <p className="border-t border-border px-5 py-2.5 text-xs text-muted">
        {t('wattroFooter', {
          id: details.wattroId,
          created: day(details.createdAt) ?? '—',
          updated: at(details.updatedAt) ?? '—',
        })}
        {' · '}
        {t('wattroCardHint')}
      </p>
    </section>
  )
}
