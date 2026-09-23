import { db } from './db'
import { cleanColumnOrder, type BoardColumnDef } from './boards'

export type BoardRow = {
  id: string
  name: string
  background: string | null
  sortOrder: number
  columns: Array<{ status: string; title: string | null; sortOrder: number }>
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
      columns: { orderBy: { sortOrder: 'asc' }, select: { status: true, title: true, sortOrder: true } },
    },
  })
}

/**
 * The order a board's columns were dragged into. A status the board does not
 * have is ignored; a column the order leaves out keeps its place after the
 * ones it names. False when there is no such board.
 */
export async function saveColumnOrder(boardId: string, statuses: unknown): Promise<boolean> {
  const order = cleanColumnOrder(statuses)
  const columns = await db.boardColumn.findMany({ where: { boardId }, select: { id: true, status: true, sortOrder: true } })
  if (columns.length === 0) return false
  const rest = columns
    .filter((c) => !order.includes(c.status as (typeof order)[number]))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => c.status)
  const wanted = [...order.filter((s) => columns.some((c) => c.status === s)), ...rest]
  await db.$transaction(
    wanted.map((status, sortOrder) =>
      db.boardColumn.updateMany({ where: { boardId, status: status as never }, data: { sortOrder } })
    )
  )
  return true
}

/** A column's own name on its board, typed over on the board itself; blank is the status's name. */
export async function renameBoardColumn(boardId: string, status: string, title: string | null): Promise<boolean> {
  const result = await db.boardColumn.updateMany({ where: { boardId, status: status as never }, data: { title } })
  return result.count > 0
}

/** A column added at the right end of a board; false when the board already has it, or is not there. */
export async function addBoardColumn(boardId: string, status: string): Promise<boolean> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { columns: { select: { status: true, sortOrder: true } } },
  })
  if (!board || board.columns.some((c) => c.status === status)) return false
  const last = Math.max(-1, ...board.columns.map((c) => c.sortOrder))
  await db.boardColumn.create({ data: { boardId, status: status as never, sortOrder: last + 1 } })
  return true
}

/** A column taken off a board — never its last one. */
export async function removeBoardColumn(boardId: string, status: string): Promise<boolean> {
  const count = await db.boardColumn.count({ where: { boardId } })
  if (count <= 1) return false
  const result = await db.boardColumn.deleteMany({ where: { boardId, status: status as never } })
  return result.count > 0
}

/**
 * A board's columns as the settings form sent them: the ones left out go,
 * the others take the order and the names given.
 */
export async function saveBoardColumns(boardId: string, columns: BoardColumnDef[]): Promise<void> {
  await db.$transaction([
    db.boardColumn.deleteMany({ where: { boardId, status: { notIn: columns.map((c) => c.status) } } }),
    ...columns.map((column, sortOrder) =>
      db.boardColumn.upsert({
        where: { boardId_status: { boardId, status: column.status } },
        create: { boardId, status: column.status, title: column.title, sortOrder },
        update: { title: column.title, sortOrder },
      })
    ),
  ])
}
