import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { requireAdmin } from '@/lib/authz'
import { getBoards } from '@/lib/boards-db'
import { ALL_PROJECT_STATUSES, type ProjectStatusKey } from '@/lib/prep-tab'
import { BOARD_BACKGROUNDS, BOARD_NAME_MAX, COLUMN_TITLE_MAX } from '@/lib/boards'
import { columnRuleKey } from '@/lib/board-rules'
import { STATUS_STYLES } from '@/components/status-badge'
import { Card } from '@/components/ui/card'
import { DeleteButton } from '@/components/delete-button'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'
import { SavedForm } from '@/components/saved-form'
import { btn } from '@/components/ui/button'
import { createBoard, deleteBoard, moveBoard, updateBoard } from './actions'

const inputClass =
  'block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

/**
 * Einstellungen → Boards: the boards of the projects page, each with its
 * columns. A column is a status with, if wanted, a name of its own on that
 * board. Which columns a board has is chosen here; the order they stand in is
 * dragged on the board itself, where it can be seen — so the rows here follow
 * that order, with the statuses the board does not have after them.
 */
export default async function BoardsPage() {
  await requireAdmin()
  const [t, tNav, tStatus, tc, tProjects, boards] = await Promise.all([
    getTranslations('settings'),
    getTranslations('nav'),
    getTranslations('status'),
    getTranslations('common'),
    getTranslations('projects'),
    getBoards(),
  ])
  /** A rule list as the board names it: its own title, else the rule's name. */
  const ruleRows = (columns: Array<{ id: string; status: string; title: string | null; rule: string | null }>) => {
    const ruled = columns.filter((c) => columnRuleKey(c.rule))
    if (ruled.length === 0) return null
    return (
      <div className="text-sm">
        <p className="text-muted">{t('boardRuleColumns')}</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {ruled.map((c) => (
            <li key={c.id} className="rounded-full border border-border px-2.5 py-0.5 text-xs">
              {c.title ?? tProjects(`rule_${c.rule}` as 'rule_paused')}
              <span className="ml-1 text-muted">· {tStatus(c.status as ProjectStatusKey)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted">{t('boardRuleColumnsHint')}</p>
      </div>
    )
  }

  /** The nine statuses, the board's own first in their order, as rows of tick, name and own title. */
  const columnRows = (
    columns: Array<{ status: string; title: string | null; rule?: string | null }>,
    tickAll: boolean,
    /** Keeps the ids apart — the same nine rows stand once per board on the page. */
    prefix: string
  ) => {
    // The plain lists only: a rule list is the board's own business.
    const has = new Map(columns.filter((c) => !columnRuleKey(c.rule)).map((c) => [c.status, c]))
    const rows: ProjectStatusKey[] = [
      ...columns.map((c) => c.status as ProjectStatusKey),
      ...ALL_PROJECT_STATUSES.filter((s) => !has.has(s)),
    ]
    return (
      <fieldset>
        <legend className="text-sm text-muted">{t('boardColumns')}</legend>
        <p className="mt-0.5 text-xs text-muted">{t('boardColumnsHint')}</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {rows.map((status) => {
            const column = has.get(status)
            return (
              <div key={status} className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                <input
                  type="checkbox"
                  name={`column_${status}`}
                  id={`${prefix}-${status}`}
                  defaultChecked={tickAll || column !== undefined}
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <label
                  htmlFor={`${prefix}-${status}`}
                  className={`w-32 shrink-0 truncate rounded-full px-2 py-0.5 text-center text-[11px] font-medium ${STATUS_STYLES[status]}`}
                >
                  {tStatus(status)}
                </label>
                <input
                  name={`title_${status}`}
                  defaultValue={column?.title ?? ''}
                  maxLength={COLUMN_TITLE_MAX}
                  placeholder={t('boardColumnTitlePlaceholder')}
                  aria-label={`${tStatus(status)} — ${t('boardColumnTitle')}`}
                  className={`${inputClass} min-w-0 flex-1 px-2 py-1 text-xs`}
                />
              </div>
            )
          })}
        </div>
      </fieldset>
    )
  }

  /** The ground the board stands on: none, or one of the colours. */
  const backgroundPicker = (current: string | null, prefix: string) => (
    <fieldset>
      <legend className="text-sm text-muted">{t('boardBackground')}</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {[null, ...Object.keys(BOARD_BACKGROUNDS)].map((key) => (
          <label key={key ?? 'none'} className="cursor-pointer" title={key ?? t('boardBackgroundNone')}>
            <input
              type="radio"
              name="background"
              value={key ?? ''}
              id={`${prefix}-bg-${key ?? 'none'}`}
              defaultChecked={(current ?? null) === key}
              className="peer sr-only"
            />
            <span
              style={key ? { background: BOARD_BACKGROUNDS[key as keyof typeof BOARD_BACKGROUNDS] } : undefined}
              className={`flex h-8 w-12 items-center justify-center rounded-md text-[10px] text-muted ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
                key ? '' : 'border border-dashed border-border bg-background'
              }`}
            >
              {key ? '' : t('boardBackgroundNone')}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )

  return (
    <div className="space-y-6">
      <StickyHead>
        <PageBar back={{ href: '/settings', label: tNav('settings') }} title={t('boardsTitle')} />
      </StickyHead>
      <PageHint className="max-w-3xl">{t('boardsHint')}</PageHint>

      <Card title={t('boardNewTitle')} description={t('boardNewHint')}>
        <SavedForm action={createBoard} className="max-w-3xl space-y-4" resetOnSave errorText={t('boardErrorForm')}>
          <label className="block text-sm">
            <span className="text-muted">{t('boardName')}</span>
            <input
              name="name"
              required
              maxLength={BOARD_NAME_MAX}
              placeholder={t('boardNamePlaceholder')}
              className={`${inputClass} mt-1 max-w-sm`}
            />
          </label>
          {backgroundPicker('blue', 'new')}
          {columnRows([], true, 'new')}
          <button type="submit" className={btn.primary}>
            {t('boardCreate')}
          </button>
        </SavedForm>
      </Card>

      {boards.map((board, index) => (
        <Card key={board.id} title={board.name}>
          <div className="space-y-4">
            <SavedForm action={updateBoard.bind(null, board.id)} className="max-w-3xl space-y-4" errorText={t('boardErrorForm')}>
              <label className="block text-sm">
                <span className="text-muted">{t('boardName')}</span>
                <input name="name" required defaultValue={board.name} maxLength={BOARD_NAME_MAX} className={`${inputClass} mt-1 max-w-sm`} />
              </label>
              {backgroundPicker(board.background, board.id)}
              {columnRows(board.columns, false, board.id)}
              {ruleRows(board.columns)}
              <button type="submit" className={btn.primarySm}>
                {tc('save')}
              </button>
            </SavedForm>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {/* Where the board's tab stands among the others. */}
              <form action={moveBoard.bind(null, board.id, -1)}>
                <button type="submit" disabled={index === 0} className={`${btn.outlineSm} disabled:opacity-40`} title={t('boardMoveUp')}>
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  {t('boardMoveUp')}
                </button>
              </form>
              <form action={moveBoard.bind(null, board.id, 1)}>
                <button
                  type="submit"
                  disabled={index === boards.length - 1}
                  className={`${btn.outlineSm} disabled:opacity-40`}
                  title={t('boardMoveDown')}
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  {t('boardMoveDown')}
                </button>
              </form>
              <Link href={`/projects?board=${board.id}`} className={`${btn.outlineSm} ml-auto`}>
                {t('boardOpen')}
              </Link>
              {boards.length > 1 ? (
                <DeleteButton
                  action={deleteBoard.bind(null, board.id)}
                  label={tc('delete')}
                  confirmMessage={t('boardDeleteConfirm', { name: board.name })}
                  errorLabels={{ lastBoard: t('boardOnlyOne') }}
                />
              ) : (
                <span className="text-xs text-muted">{t('boardOnlyOne')}</span>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
