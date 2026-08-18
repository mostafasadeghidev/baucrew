'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZE } from '@/lib/pagination'

/** Page numbers around the current page, with … for the gaps (shadcn style). */
function pageItems(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const items: Array<number | 'gap'> = [1]
  const from = Math.max(2, page - 1)
  const to = Math.min(totalPages - 1, page + 1)
  if (from > 2) items.push('gap')
  for (let p = from; p <= to; p++) items.push(p)
  if (to < totalPages - 1) items.push('gap')
  items.push(totalPages)
  return items
}

/** Query-param based pager that preserves active search/filter params. */
export function Pagination({ page, total, pageSize = PAGE_SIZE }: { page: number; total: number; pageSize?: number }) {
  const tc = useTranslations('common')
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  function hrefFor(target: number) {
    const params = new URLSearchParams(searchParams)
    if (target <= 1) params.delete('page')
    else params.set('page', String(target))
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const navClass =
    'inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40'

  return (
    <nav className="flex items-center justify-center gap-1" aria-label={tc('pagination')}>
      <Link
        href={hrefFor(page - 1)}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
        className={navClass}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{tc('prevPage')}</span>
      </Link>

      {pageItems(page, totalPages).map((item, i) =>
        item === 'gap' ? (
          <span key={`gap-${i}`} className="px-2 text-sm text-muted" aria-hidden>
            …
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(item)}
            aria-current={item === page ? 'page' : undefined}
            className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2.5 text-sm font-medium tabular-nums transition-colors ${
              item === page
                ? 'border border-border bg-surface text-foreground shadow-sm'
                : 'text-muted hover:bg-surface-hover hover:text-foreground'
            }`}
          >
            {item}
          </Link>
        )
      )}

      <Link
        href={hrefFor(page + 1)}
        aria-disabled={page >= totalPages}
        tabIndex={page >= totalPages ? -1 : undefined}
        className={navClass}
      >
        <span className="hidden sm:inline">{tc('nextPage')}</span>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </nav>
  )
}
