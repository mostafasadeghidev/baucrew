'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { TabLink, TabsList } from '@/components/ui/tabs'
import { rememberBoard } from './actions'
import { EditBoardButton, NewBoardButton, type ManagedBoard } from './board-admin'

/**
 * The boards, one tab each, the way Trello lines them up. Which board is open
 * lives in the address like the search and the year do, and is remembered for
 * this browser so the page comes back to it. For an administrator a "+"
 * after the tabs makes a board and the arrow on the open tab changes it, the
 * way Trello makes and changes boards where they stand.
 */
export function BoardTabs({
  boards,
  current,
  ariaLabel,
  manage,
  manageBoards = null,
  onGround = false,
}: {
  boards: Array<ManagedBoard>
  current: string
  ariaLabel: string
  /** The link to Einstellungen → Boards; null for those who may not go there. */
  manage: { href: string; label: string } | null
  /** Making and changing boards from the bar — the ready-made boards on offer; null for those who may not. */
  manageBoards?: { presets: Array<{ key: string; name: string; background: string }> } | null
  /** On a coloured ground the tabs are written in light on it, the way Trello's bar is. */
  onGround?: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const hrefFor = (id: string | null) => {
    const params = new URLSearchParams(searchParams)
    if (id) params.set('board', id)
    else params.delete('board')
    // What only the list understands would turn the board back into the list.
    params.delete('page')
    params.delete('status')
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }
  const index = boards.findIndex((b) => b.id === current)
  const open = index >= 0 ? boards[index] : null
  const edit = (ground: boolean) =>
    manageBoards && open ? (
      <EditBoardButton key={open.id} board={open} index={index} count={boards.length} onGround={ground} leaveHref={hrefFor(null)} />
    ) : null
  const add = manageBoards ? (
    <NewBoardButton boards={boards} presets={manageBoards.presets} onGround={onGround} openHref={(id) => hrefFor(id)} />
  ) : null

  if (onGround) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <nav aria-label={ariaLabel} role="tablist" className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {boards.map((board) =>
            board.id === current ? (
              // The open tab carries the arrow that changes its board, inside the same light pill.
              <span key={board.id} className="flex shrink-0 items-center rounded-md bg-white/90 text-neutral-900 shadow-sm">
                <Link
                  href={hrefFor(board.id)}
                  replace
                  role="tab"
                  aria-selected
                  onClick={() => void rememberBoard(board.id)}
                  className="whitespace-nowrap px-3 py-1.5 text-sm font-semibold"
                >
                  {board.name}
                </Link>
                {edit(true)}
              </span>
            ) : (
              <Link
                key={board.id}
                href={hrefFor(board.id)}
                replace
                role="tab"
                aria-selected={false}
                onClick={() => void rememberBoard(board.id)}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/25"
              >
                {board.name}
              </Link>
            )
          )}
        </nav>
        {add}
      </div>
    )
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
      {edit(false)}
      {add}
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
