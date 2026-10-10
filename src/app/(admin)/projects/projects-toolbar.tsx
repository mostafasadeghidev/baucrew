import type { ReactNode } from 'react'
import Link from 'next/link'
import { Columns3, List, Plus } from 'lucide-react'
import { projectsViewHref, type ProjectsViewKeep } from '@/lib/projects-view'
import { HeadDivider, pageTitle, pageToolbar } from '@/components/ui/page-panel'
import { projectControl } from './toolbar-styles'
import { ProjectNavLink } from './project-nav-link'

/**
 * The head of the projects page, drawn like every other page's head and on
 * one row: the page's name, the boards as pills with the choice of board or
 * list beside them, and on the right what can be done. One rule under it —
 * no track around the tabs, no box around the bar. The board is the visual
 * reference; both views render this same head.
 */
export function ProjectsToolbar({ boards, search, filters, years, menu, boardView, keep, labels, canCreate }: {
  boards: ReactNode
  search: ReactNode
  filters: ReactNode
  years: ReactNode
  menu: ReactNode
  boardView: boolean
  keep: ProjectsViewKeep
  labels: { title: string; board: string; list: string; create: string; view: string }
  canCreate: boolean
}) {
  return (
    <header className="shrink-0 border-b border-border bg-surface px-4 text-foreground md:pl-6 md:pr-8 md:pt-2">
      <div className={pageToolbar}>
        {/* Below lg the boards fold into a menu and the row would not hold the
            actions as well: they take a line of their own under it. */}
        <div className="flex min-w-0 flex-1 basis-full items-center gap-3 lg:basis-auto">
          <h1 className={`shrink-0 ${pageTitle}`}>{labels.title}</h1>
          <HeadDivider />
          <div className="min-w-0">{boards}</div>
          <HeadDivider />
          <nav aria-label={labels.view} className={projectControl.viewGroup}>
            <ProjectNavLink title={labels.board} href={projectsViewHref('board', keep)} active={boardView} className={`${projectControl.viewButton} ${boardView ? projectControl.viewOn : projectControl.viewOff}`}>
              <Columns3 className="h-4 w-4" aria-hidden /><span className="sr-only">{labels.board}</span>
            </ProjectNavLink>
            <ProjectNavLink title={labels.list} href={projectsViewHref('list', keep)} active={!boardView} className={`${projectControl.viewButton} ${!boardView ? projectControl.viewOn : projectControl.viewOff}`}>
              <List className="h-4 w-4" aria-hidden /><span className="sr-only">{labels.list}</span>
            </ProjectNavLink>
          </nav>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {search}
          {filters}
          {years}
          {canCreate && (
            <Link href="/projects/new" className={projectControl.primary}>
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{labels.create}</span>
              <span className="sr-only sm:hidden">{labels.create}</span>
            </Link>
          )}
          {menu}
        </div>
      </div>
    </header>
  )
}
