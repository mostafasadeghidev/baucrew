import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { PlayCircle } from 'lucide-react'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { btn } from '@/components/ui/button'
import { LiveSearchInput } from '@/components/live-search'
import { PageBar, PageHint, PagePanel, StickyHead } from '@/components/ui/page-panel'
import { daysOut, deviceState } from '@/lib/devices'

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireManagement()
  const [t, tc, { q }] = await Promise.all([
    getTranslations('devices'),
    getTranslations('common'),
    searchParams,
  ])
  const query = q?.trim() ?? ''

  const devices = await db.device.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { inventoryNo: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } },
            { storageLocation: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    include: {
      assignments: {
        where: { returnedAt: null },
        include: {
          project: { select: { id: true, number: true, name: true } },
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  })

  // The devices that are not in the store — the "who has it?" question, on
  // the page that lists the devices themselves. It stood on the Lager page
  // first and was looked for here (QA of 25.09.). Never narrowed by the
  // search: what is out is out.
  const out = await db.deviceAssignment.findMany({
    where: { returnedAt: null },
    include: {
      device: { select: { id: true, name: true, inventoryNo: true } },
      project: { select: { id: true, number: true, name: true } },
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { takenAt: 'asc' },
  })

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar
          title={t('title')}
          actions={
            <Link href="/devices/new" className={btn.primary}>
              {t('newDevice')}
            </Link>
          }
        />
      </StickyHead>
      <PageHint>{t('hint')}</PageHint>

      {/* Devices out of the store — who has what, longest out first */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('outTitle')}</h2>
          <p className="text-xs text-muted">{t('outHint')}</p>
        </div>
        {out.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('allInStore')}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {out.map((handout) => (
              <li key={handout.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <Link href={`/devices/${handout.device.id}`} className="font-medium text-accent hover:underline">
                  {handout.device.name}
                </Link>
                {handout.device.inventoryNo && (
                  <span className="text-xs tabular-nums text-muted">{handout.device.inventoryNo}</span>
                )}
                <span className="min-w-0 flex-1 truncate text-red-700 dark:text-red-400">
                  ●{' '}
                  {handout.project ? (
                    <Link href={`/projects/${handout.project.id}`} className="hover:underline">
                      {handout.project.number} — {handout.project.name}
                    </Link>
                  ) : handout.employee ? (
                    <Link href={`/employees/${handout.employee.id}`} className="hover:underline">
                      {`${handout.employee.firstName} ${handout.employee.lastName}`.trim()}
                    </Link>
                  ) : (
                    t('out')
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted">{t('sinceDays', { days: daysOut(handout.takenAt, new Date()) })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PagePanel>
        <div className="border-b border-border p-4">
          <LiveSearchInput param="q" placeholder={t('searchPlaceholder')} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-40" />
              <col className="w-44" />
              <col className="w-[28%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">{t('name')}</th>
                <th className="px-4 py-3 font-medium">{t('inventoryNo')}</th>
                <th className="px-4 py-3 font-medium">{t('storageLocation')}</th>
                <th className="px-4 py-3 font-medium">{t('whereNow')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    {query ? t('noResults') : t('none')}
                  </td>
                </tr>
              ) : (
                devices.map((device) => {
                  const state = deviceState(device.assignments)
                  return (
                    <tr key={device.id} className="hover:bg-surface-hover">
                      <td className="break-words px-4 py-3">
                        <Link
                          href={`/devices/${device.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {device.name}
                        </Link>
                        {device.videoUrl && (
                          <PlayCircle className="ml-1 inline h-4 w-4 text-muted" aria-label={t('video')} />
                        )}
                        {!device.active && (
                          <span className="ml-2 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">
                            {tc('inactive')}
                          </span>
                        )}
                        {device.category && (
                          <p className="text-xs text-muted">{device.category}</p>
                        )}
                      </td>
                      <td
                        className="truncate px-4 py-3 tabular-nums text-muted"
                        title={device.inventoryNo ?? undefined}
                      >
                        {device.inventoryNo ?? '—'}
                      </td>
                      <td className="break-words px-4 py-3 text-muted">{device.storageLocation ?? '—'}</td>
                      <td className="break-words px-4 py-3">
                        {state.status === 'free' ? (
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">
                            ● {t('free')}
                          </span>
                        ) : (
                          <span className="text-red-700 dark:text-red-400">
                            ●{' '}
                            {state.status === 'onSite' ? (
                              <Link href={`/projects/${state.projectId}`} className="hover:underline">
                                {state.label}
                              </Link>
                            ) : state.status === 'withEmployee' ? (
                              <Link href={`/employees/${state.employeeId}`} className="hover:underline">
                                {state.label}
                              </Link>
                            ) : (
                              t('out')
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>
    </div>
  )
}
