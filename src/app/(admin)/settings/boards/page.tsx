import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/authz'
import { getBoards } from '@/lib/boards-db'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'
import { BoardManager } from '../../projects/board-settings'

/**
 * Einstellungen → Boards: the same window the projects page opens over the
 * board (board-settings.tsx), standing on a page of its own — every board on
 * the left in the order of its tab, the chosen one on the right with its
 * name, colour and columns. `?board=<id>` opens a board, `?board=new` a new one.
 */
export default async function BoardsPage({ searchParams }: { searchParams: Promise<{ board?: string }> }) {
  await requireAdmin()
  const [{ board }, t, tNav, boards] = await Promise.all([searchParams, getTranslations('settings'), getTranslations('nav'), getBoards()])
  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar back={{ href: '/settings', label: tNav('settings') }} title={t('boardsTitle')} />
      </StickyHead>
      <PageHint className="max-w-3xl">{t('boardsHint')}</PageHint>
      <div className="h-[calc(100dvh-13rem)] min-h-[36rem] overflow-hidden rounded-xl border border-border bg-surface">
        <BoardManager
          boards={boards.map((b) => ({
            id: b.id,
            name: b.name,
            background: b.background,
            backgroundImage: b.backgroundImage,
            showOnSites: b.showOnSites,
            columns: b.columns.map((c) => ({ id: c.id, status: c.status, title: c.title, rule: c.rule, color: c.color })),
          }))}
          initial={board ?? boards[0]?.id ?? 'new'}
        />
      </div>
    </div>
  )
}
