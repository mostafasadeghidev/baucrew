'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, Plus, Settings } from 'lucide-react'
import { Menu, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { boardViewHref } from '@/lib/projects-view'
import { ProjectNavLink, rememberBoardHere } from './project-nav-link'
import { projectControl } from './toolbar-styles'
import {
  BOARD_SETTINGS_PARAM,
  BoardSettingsDialog,
  closeBoardSettings,
  openBoardSettings,
  type SettingsBoard,
} from './board-settings'

export type BoardTab = SettingsBoard & {
  /** The board's own colour or photo, as CSS for a `background` — or none. */
  swatch: string | null
}

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
 * For an administrator the open tab carries a gear and the row ends in "Neues
 * Board": both open the one window where boards are made and changed
 * (board-settings.tsx) — name, colour, columns, order, delete.
 */
export function BoardTabs({ boards, current, ariaLabel, allLabel, manageBoards = false }: {
  boards: BoardTab[]
  current: string
  ariaLabel: string
  allLabel: string
  manageBoards?: boolean
}) {
  const t = useTranslations('projects')
  const router = useRouter()
  const searchParams = useSearchParams()
  const index = boards.findIndex((board) => board.id === current)
  const currentBoard = index >= 0 ? boards[index] : undefined
  const caption = currentBoard?.name ?? allLabel
  const href = (id: string) => boardViewHref(searchParams.toString(), id)
  const remember = (id: string) => (id === 'all' ? undefined : id)
  const settings = manageBoards ? searchParams.get(BOARD_SETTINGS_PARAM) : null

  // The gear on the open board, and "Neues Board": the administrator's.
  const edit =
    manageBoards && currentBoard ? (
      <button
        type="button"
        onClick={() => openBoardSettings(currentBoard.id)}
        title={t('boardSettingsOpen')}
        aria-label={`${t('boardSettingsOpen')}: ${currentBoard.name}`}
        className="-ml-1 mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <Settings className="h-3.5 w-3.5" aria-hidden />
      </button>
    ) : null
  const add = manageBoards ? (
    <button
      type="button"
      onClick={() => openBoardSettings('new')}
      title={t('boardNew')}
      className="flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-muted transition-colors hover:bg-subtle/60 hover:text-foreground"
    >
      <Plus className="h-4 w-4" aria-hidden />
      <span className="hidden xl:inline">{t('boardNew')}</span>
      <span className="sr-only xl:hidden">{t('boardNew')}</span>
    </button>
  ) : null

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
            // The open tab carries the gear that opens its settings, inside the same pill.
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
      {settings && (
        <BoardSettingsDialog
          boards={boards}
          initial={settings}
          onClose={closeBoardSettings}
          onCreated={(id) => {
            // A new board opens at once, the way Trello opens one.
            rememberBoardHere(id)
            router.push(href(id))
          }}
        />
      )}
    </>
  )
}
