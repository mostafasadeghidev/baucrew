'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { TabLink, TabsList } from '@/components/ui/tabs'
import { rememberBoard } from './actions'

/**
 * The boards, one tab each, the way Trello lines them up. Which board is open
 * lives in the address like the search and the year do, and is remembered for
 * this browser so the page comes back to it. Beside the tabs, for an
 * administrator, the way to the page where boards are made.
 */
export function BoardTabs({
  boards,
  current,
  ariaLabel,
  manage,
}: {
  boards: Array<{ id: string; name: string }>
  current: string
  ariaLabel: string
  /** The link to Einstellungen → Boards; null for those who may not go there. */
  manage: { href: string; label: string } | null
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const hrefFor = (id: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('board', id)
    // What only the list understands would turn the board back into the list.
    params.delete('page')
    params.delete('status')
    return `${pathname}?${params.toString()}`
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <TabsList ariaLabel={ariaLabel}>
        {boards.map((board) => (
          <TabLink
            key={board.id}
            href={hrefFor(board.id)}
            active={board.id === current}
            label={board.name}
            onClick={() => void rememberBoard(board.id)}
          />
        ))}
      </TabsList>
      {manage && (
        <Link
          href={manage.href}
          title={manage.label}
          aria-label={manage.label}
          className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  )
}
