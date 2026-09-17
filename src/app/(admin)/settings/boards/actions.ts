'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { cleanBoardName, columnsFromForm } from '@/lib/boards'
import { saveBoardColumns } from '@/lib/boards-db'
import type { SaveState } from '@/components/saved-form'
import type { DeleteState } from '@/components/delete-button'

function done() {
  revalidatePath('/projects')
  revalidatePath('/settings/boards')
}

/** A new board: its name and its columns, all nine unless some were unticked. */
export async function createBoard(formData: FormData): Promise<SaveState> {
  const admin = await requireAdmin()
  const name = cleanBoardName(String(formData.get('name') ?? ''))
  const columns = columnsFromForm((n) => formData.get(n))
  if (!name || columns.length === 0) return { error: 'invalid' }
  const last = await db.board.aggregate({ _max: { sortOrder: true } })
  const board = await db.board.create({
    data: {
      name,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
      columns: { create: columns.map((c, sortOrder) => ({ status: c.status, title: c.title, sortOrder })) },
    },
    select: { id: true },
  })
  await audit({ userId: admin.id, action: 'board.create', entity: 'Board', entityId: board.id, newValue: name })
  done()
  return { savedAt: Date.now() }
}

/**
 * A board's name and columns. Columns it already had keep the order they were
 * dragged into on the board; ones ticked now are appended.
 */
export async function updateBoard(id: string, formData: FormData): Promise<SaveState> {
  const admin = await requireAdmin()
  const board = await db.board.findUnique({
    where: { id },
    select: { name: true, columns: { orderBy: { sortOrder: 'asc' }, select: { status: true } } },
  })
  if (!board) return { error: 'notFound' }
  const name = cleanBoardName(String(formData.get('name') ?? ''))
  const columns = columnsFromForm(
    (n) => formData.get(n),
    board.columns.map((c) => c.status)
  )
  if (!name || columns.length === 0) return { error: 'invalid' }
  await db.board.update({ where: { id }, data: { name } })
  await saveBoardColumns(id, columns)
  await audit({
    userId: admin.id,
    action: 'board.update',
    entity: 'Board',
    entityId: id,
    oldValue: board.name,
    newValue: `${name}: ${columns.map((c) => c.status).join(',')}`,
  })
  done()
  return { savedAt: Date.now() }
}

/** The last board stays: a projects page with no board is a page with nothing on it. */
export async function deleteBoard(id: string, _prev: DeleteState, _formData: FormData): Promise<DeleteState> {
  const admin = await requireAdmin()
  if ((await db.board.count()) <= 1) return { error: 'lastBoard' }
  const board = await db.board.findUnique({ where: { id }, select: { name: true } })
  if (!board) return { error: 'notFound' }
  await db.board.delete({ where: { id } })
  await audit({ userId: admin.id, action: 'board.delete', entity: 'Board', entityId: id, oldValue: board.name })
  done()
  return {}
}

/** One place up or down among the boards' tabs. */
export async function moveBoard(id: string, direction: -1 | 1): Promise<void> {
  await requireAdmin()
  const boards = await db.board.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } })
  const from = boards.findIndex((b) => b.id === id)
  const to = from + direction
  if (from === -1 || to < 0 || to >= boards.length) return
  const order = boards.map((b) => b.id)
  ;[order[from], order[to]] = [order[to], order[from]]
  await db.$transaction(order.map((boardId, sortOrder) => db.board.update({ where: { id: boardId }, data: { sortOrder } })))
  done()
}
