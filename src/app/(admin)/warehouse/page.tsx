import Link from 'next/link'
import { PlayCircle } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { getOptionList } from '@/lib/option-lists-db'
import { optionLabel } from '@/lib/option-lists'
import { db } from '@/lib/db'
import { LiveSearchInput, LiveSelect } from '@/components/live-search'
import { Pagination } from '@/components/pagination'
import { PAGE_SIZE, parsePage } from '@/lib/pagination'
import { listCategories } from './actions'
import { CategoryManager } from './category-manager'
import { btn } from '@/components/ui/button'
import { daysOut } from '@/lib/devices'

export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; page?: string }>
}) {
  const { q, kind, page: pageParam } = await searchParams
  const [t, tc, tDevices, locale, kinds] = await Promise.all([
    getTranslations('warehouse'),
    getTranslations('common'),
    getTranslations('devices'),
    getLocale(),
    getOptionList('itemKinds'),
  ])
  const kindLabel = (value: string) => optionLabel(kinds, value, locale)
  const query = q?.trim() ?? ''
  const kindFilter = kinds.some((k) => k.value === kind) ? kind : undefined
  const page = parsePage(pageParam)

  const where = {
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { category: { contains: query, mode: 'insensitive' as const } },
            { location: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    db.catalogItem.findMany({
      where,
      orderBy: [{ active: 'desc' }, { kind: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.catalogItem.count({ where }),
  ])
  const categories = await listCategories()

  // Machines that are not in the store — the "who has it?" question, answered
  // on the page the warehouse people already have open.
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted">{t('catalogTitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/warehouse/new"
            className={btn.primary}
          >
            {t('newItem')}
          </Link>
        </div>
      </div>

      <div className="flex max-w-2xl flex-wrap items-center gap-2">
        <LiveSearchInput placeholder={t('searchPlaceholder')} />
        <LiveSelect
          param="kind"
          allLabel={t('allKinds')}
          options={kinds.map((k) => ({ value: k.value, label: kindLabel(k.value) }))}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">{t('name')}</th>
              <th className="px-4 py-3 font-medium">{t('kind')}</th>
              <th className="px-4 py-3 font-medium">{t('category')}</th>
              <th className="px-4 py-3 font-medium">{t('unit')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('stock')}</th>
              <th className="px-4 py-3 font-medium">{t('location')}</th>
              <th className="px-4 py-3 font-medium">{tc('active')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  {t('noResults')}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <Link
                      href={`/warehouse/${item.id}/edit`}
                      className="font-medium text-accent hover:underline"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.kind === 'TOOL'
                          ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
                          : item.kind === 'MATERIAL'
                            ? 'bg-violet-500/15 text-violet-700 dark:text-violet-400'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {kindLabel(item.kind)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{item.category ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{item.unit ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {item.stockQuantity != null ? Number(item.stockQuantity) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {item.location ?? '—'}
                    {item.videoUrl && (
                      <a
                        href={item.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={t('videoUrl')}
                        className="ml-2 inline-flex align-middle text-accent hover:underline"
                      >
                        <PlayCircle className="h-4 w-4" aria-hidden />
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.active
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      {item.active ? tc('active') : tc('inactive')}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} />

      {/* Devices out of the store — who has what */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{tDevices('holder')}</h2>
          <Link href="/devices" className={`${btn.outlineSm} px-2 py-0.5 text-xs text-muted`}>
            {tDevices('openDevices')} <span aria-hidden>→</span>
          </Link>
        </div>
        {out.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{tDevices('allInStore')}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {out.map((handout) => (
              <li key={handout.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <Link
                  href={`/devices/${handout.device.id}`}
                  className="font-medium text-accent hover:underline"
                >
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
                    tDevices('out')
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {tDevices('sinceDays', { days: daysOut(handout.takenAt, new Date()) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <CategoryManager categories={categories} />
    </div>
  )
}
