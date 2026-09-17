import { db } from './db'
import { cleanColumnOrder, type BoardColumnDef } from './boards'

export type BoardRow = {
  id: string
  name: string
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
