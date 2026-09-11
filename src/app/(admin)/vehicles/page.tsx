import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { VehicleStatusBadge } from '@/components/vehicle-status-badge'
import { Pagination } from '@/components/pagination'
import { PAGE_SIZE, parsePage } from '@/lib/pagination'
import { btn } from '@/components/ui/button'
import { PagePanel, pageTitle, pageToolbar, StickyHead } from '@/components/ui/page-panel'

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const [t, tc] = await Promise.all([getTranslations('vehicles'), getTranslations('common')])
  const page = parsePage(pageParam)

  const [vehicles, total] = await Promise.all([
    db.vehicle.findMany({
      include: {
        _count: { select: { projects: true } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.vehicle.count(),
  ])

  return (
    <div className="space-y-4">
      <StickyHead>
        <div className={pageToolbar}>
          <h1 className={pageTitle}>{t('title')}</h1>
          <Link
            href="/vehicles/new"
            className={btn.primary}
          >
            {t('newVehicle')}
          </Link>
        </div>
      </StickyHead>

      <PagePanel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-32" />
              <col className="w-[20%]" />
              <col className="w-36" />
              <col className="w-28" />
              <col className="w-48" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">{t('name')}</th>
                <th className="px-4 py-3 font-medium">{t('licensePlate')}</th>
                <th className="px-4 py-3 font-medium">{t('type')}</th>
                <th className="px-4 py-3 font-medium">{t('status')}</th>
                <th className="px-4 py-3 font-medium">{tc('active')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('projectsTitle')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vehicles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    {t('noResults')}
                  </td>
                </tr>
              ) : (
                vehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-surface-hover">
                    <td className="break-words px-4 py-3">
                      <Link href={`/vehicles/${v.id}`} className="font-medium text-accent hover:underline">
                        {v.name}
                      </Link>
                    </td>
                    <td className="truncate px-4 py-3 text-muted" title={v.licensePlate ?? undefined}>
                      {v.licensePlate ?? '—'}
                    </td>
                    <td className="break-words px-4 py-3 text-muted">{v.type ?? '—'}</td>
                    <td className="px-4 py-3">
                      <VehicleStatusBadge status={v.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          v.active
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {v.active ? tc('active') : tc('inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{v._count.projects}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <Pagination page={page} total={total} />
    </div>
  )
}
