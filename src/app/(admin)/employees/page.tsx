import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { LiveSearchInput } from '@/components/live-search'
import { Pagination } from '@/components/pagination'
import { PAGE_SIZE, parsePage } from '@/lib/pagination'

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q, page: pageParam } = await searchParams
  const [t, tc, tRoles] = await Promise.all([
    getTranslations('employees'),
    getTranslations('common'),
    getTranslations('roles'),
  ])
  const query = q?.trim() ?? ''
  const page = parsePage(pageParam)

  // Skills are a text[] column; Prisma only offers exact-element matching, so
  // partial, case-insensitive skill search runs as a parameterised SQL
  // subquery ("mal" → Malern, Malerarbeiten …).
  const skillMatchIds = query
    ? (
        await db.$queryRaw<Array<{ id: string }>>`
          SELECT e.id FROM "Employee" e
          WHERE EXISTS (
            SELECT 1 FROM unnest(e.skills) AS s WHERE s ILIKE ${'%' + query + '%'}
          )`
      ).map((r) => r.id)
    : []

  const where = query
    ? {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' as const } },
          { lastName: { contains: query, mode: 'insensitive' as const } },
          { phone: { contains: query, mode: 'insensitive' as const } },
          { email: { contains: query, mode: 'insensitive' as const } },
          ...(skillMatchIds.length ? [{ id: { in: skillMatchIds } }] : []),
        ],
      }
    : undefined

  const [employees, total] = await Promise.all([
    db.employee.findMany({
      where,
      include: {
        _count: { select: { projectMemberships: true } },
        user: { select: { username: true, role: true, active: true } },
      },
      orderBy: [{ active: 'desc' }, { firstName: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.employee.count({ where }),
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <Link
          href="/employees/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          {t('newEmployee')}
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
              <th className="px-4 py-3 font-medium">{t('phone')}</th>
              <th className="px-4 py-3 font-medium">{t('skills')}</th>
              <th className="px-4 py-3 font-medium">{t('status')}</th>
              <th className="px-4 py-3 font-medium">{t('accountColumn')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('projectsTitle')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {t('noResults')}
                </td>
              </tr>
            ) : (
              employees.map((e) => (
                <tr key={e.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <Link href={`/employees/${e.id}`} className="font-medium text-accent hover:underline">
                      {e.firstName} {e.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{e.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {e.skills.length === 0
                        ? '—'
                        : e.skills.map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium"
                            >
                              {s}
                            </span>
                          ))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        e.active
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      {e.active ? tc('active') : tc('inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {e.user ? (
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium">
                          {e.user.username}
                        </span>
                        {e.user.role !== 'EMPLOYEE' && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              e.user.role === 'ADMIN'
                                ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                                : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
                            }`}
                          >
                            {tRoles(e.user.role)}
                          </span>
                        )}
                        {!e.user.active && <span className="text-xs text-muted">({tc('inactive')})</span>}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{e._count.projectMemberships}</td>
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
