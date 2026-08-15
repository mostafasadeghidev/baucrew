'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PAGE_SIZE } from '@/lib/pagination'

/** Query-param based pager that preserves active search/filter params. */
export function Pagination({ page, total }: { page: number; total: number }) {
  const tc = useTranslations('common')
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (totalPages <= 1) return null

  function hrefFor(target: number) {
    const params = new URLSearchParams(searchParams)
    if (target <= 1) params.delete('page')
    else params.set('page', String(target))
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const linkClass =
    'rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover aria-disabled:pointer-events-none aria-disabled:opacity-40'

  return (
    <nav className="flex items-center justify-between gap-3">
      <Link
        href={hrefFor(page - 1)}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
        title={tc('prevPage')}
        className={linkClass}
      >
        ←
      </Link>
      <span className="text-sm text-muted">{tc('pageOf', { page, total: totalPages })}</span>
      <Link
        href={hrefFor(page + 1)}
        aria-disabled={page >= totalPages}
        tabIndex={page >= totalPages ? -1 : undefined}
        title={tc('nextPage')}
        className={linkClass}
      >
        →
      </Link>
    </nav>
  )
}
