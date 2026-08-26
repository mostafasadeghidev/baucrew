import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { PlayCircle } from 'lucide-react'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { btn } from '@/components/ui/button'
import { LiveSearchInput } from '@/components/live-search'
import { deviceState } from '@/lib/devices'

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

  const free = devices.filter((d) => d.assignments.length === 0).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">
            {t('summary', { free, total: devices.length })}
          </p>
        </div>
        <Link href="/devices/new" className={btn.primary}>
          {t('newDevice')}
        </Link>
      </div>

      <LiveSearchInput param="q" placeholder={t('searchPlaceholder')} />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
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
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 tabular-nums text-muted">{device.inventoryNo ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">{device.storageLocation ?? '—'}</td>
                    <td className="px-4 py-3">
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
    </div>
  )
}
