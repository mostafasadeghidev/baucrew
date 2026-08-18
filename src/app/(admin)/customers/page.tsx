import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { LiveSearchInput } from '@/components/live-search'
import { Pagination } from '@/components/pagination'
import { PAGE_SIZE, parsePage } from '@/lib/pagination'
import { btn } from '@/components/ui/button'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q, page: pageParam } = await searchParams
  const t = await getTranslations('customers')
  const query = q?.trim() ?? ''
  const page = parsePage(pageParam)

  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { company: { contains: query, mode: 'insensitive' as const } },
          { contactPerson: { contains: query, mode: 'insensitive' as const } },
          { phone: { contains: query, mode: 'insensitive' as const } },
          { email: { contains: query, mode: 'insensitive' as const } },
          { city: { contains: query, mode: 'insensitive' as const } },
        ],
      }
    : undefined

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: { _count: { select: { projects: true } } },
      orderBy: { name: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.customer.count({ where }),
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <Link
          href="/customers/new"
          className={btn.primary}
        >
          {t('newCustomer')}
        </Link>
      </div>

      <div className="flex max-w-md">
        <LiveSearchInput placeholder={t('searchPlaceholder')} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">{t('name')}</th>
              <th className="px-4 py-3 font-medium">{t('company')}</th>
              <th className="px-4 py-3 font-medium">{t('phone')}</th>
              <th className="px-4 py-3 font-medium">{t('city')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('projects')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  {t('noResults')}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-accent hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.company ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{c.city ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c._count.projects}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} />
    </div>
  )
}
