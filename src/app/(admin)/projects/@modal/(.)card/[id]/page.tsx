import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/authz'
import { projectScope } from '@/lib/project-scope'
import { BOARD_COOKIE, pickBoard } from '@/lib/boards'
import { getBoards } from '@/lib/boards-db'
import { trelloRuleId } from '@/lib/board-rules'
import { cardReturnTo } from '@/lib/card-url'
import { assembleMovePlaces, moveColumnFor, moveFacts, type CardMovePlaces } from '@/lib/card-move-places'
import { todayUtc } from '@/lib/dates'
import { ProjectStatus } from '@/generated/prisma/enums'
import { CardSheet } from '../../../card-sheet'
import { ProjectDetail } from '../../../[id]/project-detail'

/**
 * A card opened from the board or the list (soft navigation intercepts the
 * card route): the project's page in the sheet, the board still underneath —
 * only the card streams, never the board again. A cold load of the address
 * does not land here; it shows the project's full page (card/[id] passes it
 * on). What the sheet needs of the board — where a save returns to, where
 * the card can be moved to — is computed here from the address's context
 * params, the same rules the board page itself follows.
 */
export default async function CardModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const user = await requireStaff()
  const [t, tStatus] = await Promise.all([getTranslations('projects'), getTranslations('status')])
  const currentYear = todayUtc().getUTCFullYear()

  // The board context the card was opened from rides in the address.
  const context = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) for (const v of value) context.append(key, v)
    else if (value) context.set(key, value)
  }
  const returnTo = cardReturnTo(context, id)

  // The board the card stands on — "Alle Projekte" has none; an address that
  // names no board (the sidebar, a mention) means the one last looked at, as
  // on the board page itself.
  const boards = await getBoards()
  const boardParam = typeof sp.board === 'string' ? sp.board : undefined
  const board = boardParam === 'all' ? null : pickBoard(boards, boardParam, (await cookies()).get(BOARD_COOKIE)?.value)

  const movePlaces: CardMovePlaces = await (async () => {
    const scope = projectScope(user)
    const [destinationCards, facts] = await Promise.all([
      db.project.findMany({
        where: { AND: [scope ?? {}, { archivedAt: null }] },
        select: {
          id: true,
          number: true,
          status: true,
          boardPosition: true,
          pausedAt: true,
          plannedStart: true,
          planMonth: true,
          priority: true,
          invoices: { where: { part: 1 }, select: { id: true } },
          links: { where: { system: 'trello' }, select: { externalListId: true } },
        },
        orderBy: { number: 'desc' },
      }),
      db.project.findUnique({
        where: { id },
        select: { status: true, pausedAt: true, plannedStart: true, planMonth: true, priority: true, invoices: { where: { part: 1 }, select: { id: true } }, links: { where: { system: 'trello' }, select: { externalListId: true } } },
      }),
    ])
    const ruleLabel = (rule: string) => (trelloRuleId(rule) ? t('rule_trello') : t(`rule_${rule}` as 'rule_paused', { year: currentYear + 1 }))
    const columnId = facts && board
      ? moveColumnFor(
          board.columns.map((c) => ({ key: c.id, status: c.status, rule: c.rule })),
          moveFacts({ status: facts.status, pausedAt: facts.pausedAt, plannedStart: facts.plannedStart, planMonth: facts.planMonth, priority: facts.priority, invoice1: facts.invoices.length > 0, trelloListId: facts.links.find((l) => l.externalListId)?.externalListId ?? null }),
          currentYear
        )
      : null
    return assembleMovePlaces({
      boards,
      rows: destinationCards.map((p) => ({ ...p, invoice1: p.invoices.length > 0, trelloListId: p.links.find((l) => l.externalListId)?.externalListId ?? null })),
      currentYear,
      boardId: board?.id ?? null,
      columnId,
      labelFor: (status, rule) => (rule ? ruleLabel(rule) : tStatus(status as ProjectStatus)),
    })
  })()

  return (
    <CardSheet>
      <ProjectDetail key={id} id={id} sheet={{ returnTo, move: movePlaces }} />
    </CardSheet>
  )
}
