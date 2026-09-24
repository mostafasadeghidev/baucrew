import { db } from './db'
import { cleanColumnOrder, type BoardColumnDef } from './boards'
import { columnRuleKey, RULE_STATUS, type ColumnRule } from './board-rules'
import type { BoardPreset } from './board-presets'

export type BoardRow = {
  id: string
  name: string
  background: string | null
  sortOrder: number
  columns: Array<{ id: string; status: string; title: string | null; rule: string | null; sortOrder: number }>
}

/** Every board in the order they stand, each with its columns left to right. */
export async function getBoards(): Promise<BoardRow[]> {
  return db.board.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      background: true,
      sortOrder: true,
      columns: { orderBy: { sortOrder: 'asc' }, select: { id: true, status: true, title: true, rule: true, sortOrder: true } },
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

/** A board made from a preset, at the end of the tabs, with every list the preset names. */
export async function createBoardFromPreset(preset: BoardPreset): Promise<string> {
  const last = await db.board.aggregate({ _max: { sortOrder: true } })
  const board = await db.board.create({
    data: {
      name: preset.name,
      background: preset.background,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
      columns: { create: preset.columns.map((c, sortOrder) => ({ status: c.status, rule: c.rule, title: c.title, sortOrder })) },
    },
    select: { id: true },
  })
  return board.id
}

/** A column's own name on its board, typed over on the board itself; blank is the status's name. Its board's id comes back. */
export async function renameBoardColumn(columnId: string, title: string | null): Promise<string | null> {
  const column = await db.boardColumn.findUnique({ where: { id: columnId }, select: { boardId: true } })
  if (!column) return null
  await db.boardColumn.update({ where: { id: columnId }, data: { title } })
  return column.boardId
}

/**
 * A column added at the right end of a board: a status's plain list, or a
 * rule's list (whose status the rule decides). False when the board already
 * has that very list, or is not there.
 */
export async function addBoardColumn(boardId: string, status: string, rule: ColumnRule | null): Promise<boolean> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { columns: { select: { status: true, rule: true, sortOrder: true } } },
  })
  if (!board) return false
  const own = rule ? RULE_STATUS[rule] : status
  if (board.columns.some((c) => c.status === own && (columnRuleKey(c.rule) ?? null) === rule)) return false
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
 * A board's plain columns as the settings form sent them: the ones left out
 * go, the others take the order and the names given. The rule lists are
 * added and taken away on the board itself and keep their places here, after
 * the plain ones.
 */
export async function saveBoardColumns(boardId: string, columns: BoardColumnDef[]): Promise<void> {
  const existing = await db.boardColumn.findMany({ where: { boardId }, select: { id: true, status: true, rule: true, sortOrder: true } })
  const plain = existing.filter((c) => !columnRuleKey(c.rule))
  const ruled = existing.filter((c) => columnRuleKey(c.rule)).sort((a, b) => a.sortOrder - b.sortOrder)
  const gone = plain.filter((c) => !columns.some((w) => w.status === c.status)).map((c) => c.id)
  await db.$transaction([
    ...(gone.length > 0 ? [db.boardColumn.deleteMany({ where: { id: { in: gone } } })] : []),
    ...columns.map((column, sortOrder) => {
      const had = plain.find((c) => c.status === column.status)
      return had
        ? db.boardColumn.update({ where: { id: had.id }, data: { title: column.title, sortOrder } })
        : db.boardColumn.create({ data: { boardId, status: column.status, title: column.title, sortOrder } })
    }),
    ...ruled.map((c, i) => db.boardColumn.update({ where: { id: c.id }, data: { sortOrder: columns.length + i } })),
  ])
}
