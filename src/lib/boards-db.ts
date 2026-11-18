import { db } from './db'
import { cleanColumnOrder } from './boards'
import { RULE_STATUS, type ColumnRule, trelloRuleId } from './board-rules'
import { planColumnSave, type CleanBoard } from './board-draft'

export type BoardRow = {
  id: string
  name: string
  background: string | null
  /** A photo as the ground instead (its storage key), or null. */
  backgroundImage: string | null
  sortOrder: number
  /** Baustellen (/sites) shows this board. */
  showOnSites: boolean
  columns: Array<{ id: string; status: string; title: string | null; rule: string | null; color: string | null; sortOrder: number }>
}

/** Every board in the order they stand, each with its columns left to right. */
export async function getBoards(): Promise<BoardRow[]> {
  return db.board.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      background: true,
      backgroundImage: true,
      sortOrder: true,
      showOnSites: true,
      columns: { orderBy: { sortOrder: 'asc' }, select: { id: true, status: true, title: true, rule: true, color: true, sortOrder: true } },
    },
  })
}

/**
 * The order a board's columns were dragged into, as their ids. A column the
 * board does not have is ignored; a column the order leaves out keeps its
 * place after the ones it names. False when there is no such board.
 */
export async function saveColumnOrder(boardId: string, ids: unknown): Promise<boolean> {
  const order = cleanColumnOrder(ids)
  const columns = await db.boardColumn.findMany({ where: { boardId }, select: { id: true, sortOrder: true } })
  if (columns.length === 0) return false
  const rest = columns
    .filter((c) => !order.includes(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => c.id)
  const wanted = [...order.filter((id) => columns.some((c) => c.id === id)), ...rest]
  await db.$transaction(wanted.map((id, sortOrder) => db.boardColumn.update({ where: { id }, data: { sortOrder } })))
  return true
}

/** A column's own name on its board, typed over on the board itself; blank is the status's name. Its board's id comes back. */
export async function renameBoardColumn(columnId: string, title: string | null): Promise<string | null> {
  const column = await db.boardColumn.findUnique({ where: { id: columnId }, select: { boardId: true } })
  if (!column) return null
  await db.boardColumn.update({ where: { id: columnId }, data: { title } })
  return column.boardId
}

/** A column's tint, picked from its menu on the board; null is the plain grey. Its board's id comes back. */
export async function setBoardColumnColor(columnId: string, color: string | null): Promise<string | null> {
  const column = await db.boardColumn.findUnique({ where: { id: columnId }, select: { boardId: true } })
  if (!column) return null
  await db.boardColumn.update({ where: { id: columnId }, data: { color } })
  return column.boardId
}

/**
 * A column added at the right end of a board: a status's plain list, a rule's
 * list (whose status the rule decides), or a Trello list's mirror under the
 * status given. False when the board already has that very list, or is not there.
 */
export async function addBoardColumn(boardId: string, status: string, rule: string | null): Promise<boolean> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { columns: { select: { status: true, rule: true, sortOrder: true } } },
  })
  if (!board) return false
  const own = rule && trelloRuleId(rule) === null ? RULE_STATUS[rule as ColumnRule] : status
  if (board.columns.some((c) => c.status === own && c.rule === rule)) return false
  const last = Math.max(-1, ...board.columns.map((c) => c.sortOrder))
  await db.boardColumn.create({ data: { boardId, status: own as never, rule, sortOrder: last + 1 } })
  return true
}

/** A column taken off its board — never the board's last one. The board's id comes back. */
export async function removeBoardColumn(columnId: string): Promise<string | null> {
  const column = await db.boardColumn.findUnique({ where: { id: columnId }, select: { boardId: true } })
  if (!column) return null
  const count = await db.boardColumn.count({ where: { boardId: column.boardId } })
  if (count <= 1) return null
  await db.boardColumn.delete({ where: { id: columnId } })
  return column.boardId
}

/**
 * A board saved from the settings window, all of it at once: its name, its
 * colour, whether Baustellen shows it, and its columns as the draft has them
 * (see `planColumnSave`). A new board goes at the end of the tabs. Its id
 * comes back; null when the board to change is not there.
 *
 * Baustellen shows one board: the tick saved on this one is taken off every
 * other in the same transaction.
 */
export async function saveBoardDraft(id: string | null, board: CleanBoard): Promise<string | null> {
  if (id === null) {
    return db.$transaction(async (tx) => {
      const last = await tx.board.aggregate({ _max: { sortOrder: true } })
      if (board.showOnSites) await tx.board.updateMany({ where: { showOnSites: true }, data: { showOnSites: false } })
      const made = await tx.board.create({
        data: {
          name: board.name,
          background: board.background,
          showOnSites: board.showOnSites,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
          columns: { create: board.columns.map((c, sortOrder) => ({ status: c.status, title: c.title, rule: c.rule, color: c.color, sortOrder })) },
        },
        select: { id: true },
      })
      return made.id
    })
  }
  const existing = await db.boardColumn.findMany({ where: { boardId: id }, select: { id: true, rule: true } })
  if (!(await db.board.findUnique({ where: { id }, select: { id: true } }))) return null
  const plan = planColumnSave(existing, board.columns)
  await db.$transaction([
    ...(board.showOnSites ? [db.board.updateMany({ where: { showOnSites: true, id: { not: id } }, data: { showOnSites: false } })] : []),
    db.board.update({ where: { id }, data: { name: board.name, background: board.background, showOnSites: board.showOnSites } }),
    ...(plan.remove.length > 0 ? [db.boardColumn.deleteMany({ where: { id: { in: plan.remove }, boardId: id } })] : []),
    ...plan.update.map((c) => db.boardColumn.update({ where: { id: c.id }, data: { status: c.status, title: c.title, color: c.color, sortOrder: c.sortOrder } })),
    ...plan.create.map((c) => db.boardColumn.create({ data: { boardId: id, status: c.status, title: c.title, rule: c.rule, color: c.color, sortOrder: c.sortOrder } })),
  ])
  return id
}
