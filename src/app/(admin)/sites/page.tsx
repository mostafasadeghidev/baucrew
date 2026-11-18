import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireStaff } from '@/lib/authz'
import { sitesBoard } from '@/lib/boards'
import { getBoards } from '@/lib/boards-db'
import { PageBar, StickyHead } from '@/components/ui/page-panel'
import { ProjectsBoard, type ProjectsSearchParams } from '../projects/projects-board'

/**
 * Baustellen: the running jobs, as the board the office keeps them on — the
 * projects page's board view fixed to the one board ticked "unter Baustellen
 * zeigen" (docs/CHANGE-baustellen-board.md). The same cards, the same moves,
 * the same sheet; a site manager sees the projects they are named on, as on
 * the projects page, and never a price. With no board ticked the page says
 * so, and where the tick is set.
 */
export default async function SitesPage({ searchParams }: { searchParams: Promise<ProjectsSearchParams> }) {
  const [user, boards, t] = await Promise.all([requireStaff(), getBoards(), getTranslations('sites')])
  const board = sitesBoard(boards)
  if (board) return <ProjectsBoard searchParams={searchParams} base="/sites" fixedBoardId={board.id} />
  const admin = user.role === 'ADMIN'
  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar title={t('title')} />
      </StickyHead>
      <div className="rounded-lg border border-border bg-surface px-4 py-10 text-center">
        <p className="text-sm font-medium">{t('noBoard')}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{admin ? t('noBoardHint') : t('noBoardAsk')}</p>
        {admin && (
          <Link href="/settings/boards" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
            {t('noBoardLink')} →
          </Link>
        )}
      </div>
    </div>
  )
}
