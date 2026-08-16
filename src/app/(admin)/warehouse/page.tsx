import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { LiveSearchInput, LiveSelect } from '@/components/live-search'
import { Pagination } from '@/components/pagination'
import { PAGE_SIZE, parsePage } from '@/lib/pagination'
import { ItemKind } from '@/generated/prisma/enums'
import { listCategories } from './actions'
import { CategoryManager } from './category-manager'

export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; page?: string }>
}) {
  const { q, kind, page: pageParam } = await searchParams
  const [t, tc, tKind, tToday] = await Promise.all([
    getTranslations('warehouse'),
    getTranslations('common'),
    getTranslations('itemKind'),
    getTranslations('today'),
  ])
  const query = q?.trim() ?? ''
  const kindFilter = kind === 'TOOL' || kind === 'MATERIAL' ? (kind as ItemKind) : undefined
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted">{t('catalogTitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/today"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            {tToday('title')}
          </Link>
          <Link
            href="/warehouse/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
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
          options={[
            { value: 'TOOL', label: tKind('TOOL') },
            { value: 'MATERIAL', label: tKind('MATERIAL') },
          ]}
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
                          : 'bg-violet-500/15 text-violet-700 dark:text-violet-400'
                      }`}
                    >
                      {tKind(item.kind)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{item.category ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{item.unit ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {item.stockQuantity != null ? Number(item.stockQuantity) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">{item.location ?? '—'}</td>
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
      <CategoryManager categories={categories} />
    </div>
  )
}
