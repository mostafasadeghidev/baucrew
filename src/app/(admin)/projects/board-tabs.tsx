'use client'

import { useSearchParams } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { Menu, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { boardViewHref } from '@/lib/projects-view'
import { ProjectNavLink } from './project-nav-link'
import { projectControl } from './toolbar-styles'
import { EditBoardButton, NewBoardButton, type ManagedBoard } from './board-admin'

export type BoardTab = ManagedBoard & {
  /** The board's own colour or photo, as CSS for a `background` — or none. */
  swatch: string | null
}

/** Making and changing boards from the bar — the ready-made boards on offer; null for those who may not. */
export type ManageBoards = { presets: Array<{ key: string; name: string; background: string }> }

/**
 * The board's colour, worn by its tab instead of by the whole page. A board
 * used to paint the window behind its lists in its colour or its photo; every
 * other surface of the app then sat on it like a sticker. The colour still
 * tells the boards apart — here, where the choice between them is made.
 */
function Swatch({ css }: { css: string | null }) {
  return (
    <span
      aria-hidden
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${css ? '' : 'border border-border-strong'}`}
      style={css ? { background: css } : undefined}
    />
  )
}

/**
 * The boards, and after them "all projects". Scope and presentation are
 * separate: each scope supports either view.
 *
 * On a wide screen every board's name stands as a tab, so switching is one
 * click and the office always sees which boards there are; the row scrolls
 * sideways if there are more than fit. On a narrow screen the same choices
 * fold into a menu under the current board's name.
 *
 * For an administrator a "+" after the boards makes one and the arrow on the
 * open tab changes it — its title, colour or photo, place, or away with it —
 * the way Trello makes and changes boards where they stand.
 */
export function BoardTabs({ boards, current, ariaLabel, allLabel, manageBoards = null }: {
  boards: BoardTab[]
  current: string
  ariaLabel: string
  allLabel: string
  manageBoards?: ManageBoards | null
}) {
  const searchParams = useSearchParams()
  const index = boards.findIndex((board) => board.id === current)
  const currentBoard = index >= 0 ? boards[index] : undefined
  const caption = currentBoard?.name ?? allLabel
  const href = (id: string) => boardViewHref(searchParams.toString(), id)
  const remember = (id: string) => (id === 'all' ? undefined : id)

  // The arrow on the open board, and the "+" for a new one: the administrator's.
  const edit =
    manageBoards && currentBoard ? (
      <EditBoardButton key={`edit-${currentBoard.id}`} board={currentBoard} index={index} count={boards.length} leaveHref={href('all')} />
    ) : null
  const add = manageBoards ? <NewBoardButton boards={boards} presets={manageBoards.presets} openHref={href} /> : null

  const entry = (id: string, name: string, swatch?: string | null) => (
    <ProjectNavLink key={id} role="menuitemradio" href={href(id)} active={id === current} rememberBoard={remember(id)} className={menuItemClass}>
      <Check aria-hidden className={`h-4 w-4 shrink-0 text-accent ${id === current ? '' : 'invisible'}`} />
      {swatch !== undefined && <Swatch css={swatch} />}
      <span className="max-w-64 truncate">{name}</span>
    </ProjectNavLink>
  )
  const tab = (id: string, name: string, swatch?: string | null) => (
    <ProjectNavLink
      key={id}
      href={href(id)}
      active={id === current}
      rememberBoard={remember(id)}
      title={name}
      className={`${projectControl.boardTab} ${id === current ? projectControl.boardTabOn : projectControl.boardTabOff}`}
    >
      {swatch !== undefined && <Swatch css={swatch} />}
      <span className="truncate">{name}</span>
    </ProjectNavLink>
  )

  return (
    <>
      <nav aria-label={ariaLabel} className="hidden min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden">
        {boards.map((board) =>
          board.id === current && edit ? (
            // The open tab carries the arrow that changes its board, inside the same pill.
            <span key={board.id} className={`flex shrink-0 items-center rounded-md ${projectControl.boardTabOn}`}>
              {tab(board.id, board.name, board.swatch)}
              {edit}
            </span>
          ) : (
            tab(board.id, board.name, board.swatch)
          )
        )}
        {add}
        <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
        {tab('all', allLabel)}
      </nav>
      <div className="flex min-w-0 items-center gap-1 lg:hidden">
        <Menu
          side="bottom"
          label={`${ariaLabel}: ${caption}`}
          className={`${projectControl.button} min-w-0 max-w-[calc(100vw-14rem)] justify-between`}
          trigger={
            <>
              {currentBoard && <Swatch css={currentBoard.swatch} />}
              <span className="truncate">{caption}</span>
              <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-muted" />
            </>
          }
        >
          {boards.map((board) => entry(board.id, board.name, board.swatch))}
          <MenuSeparator />
          {entry('all', allLabel)}
        </Menu>
        {edit}
        {add}
      </div>
    </>
  )
}
