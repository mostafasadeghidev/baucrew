'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { deleteStoredFile, saveStoredFile } from '@/lib/file-storage'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { boardBackgroundKey, cleanBoardName, columnsFromForm } from '@/lib/boards'
import { createBoardFromPreset, saveBoardColumns } from '@/lib/boards-db'
import { boardPreset, presetIsSound } from '@/lib/board-presets'
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
      background: boardBackgroundKey(String(formData.get('background') ?? '')),
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
  await db.board.update({ where: { id }, data: { name, background: boardBackgroundKey(String(formData.get('background') ?? '')) } })
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

/** A board the way the client had it in Trello, with one click; it opens once it is made. */
export async function createPresetBoard(key: string): Promise<void> {
  const admin = await requireAdmin()
  const preset = boardPreset(key, new Date().getUTCFullYear())
  if (!preset || !presetIsSound(preset)) return
  const id = await createBoardFromPreset(preset)
  await audit({ userId: admin.id, action: 'board.create', entity: 'Board', entityId: id, newValue: `${preset.name} (${key})` })
  done()
  redirect(`/projects?board=${id}`)
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

// ── A photo as the board's ground ──

export type BoardImageState = { error?: 'invalidType' | 'tooLarge' | 'saveFailed'; savedAt?: number }

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const IMAGE_MAX_BYTES = 8 * 1024 * 1024

/** A photo uploaded as the board's ground, the way Trello's boards wear one; the one before is deleted. */
export async function uploadBoardImage(boardId: string, _prev: BoardImageState, formData: FormData): Promise<BoardImageState> {
  const admin = await requireAdmin()
  const file = formData.get('image')
  if (!(file instanceof File) || file.size === 0) return { error: 'saveFailed' }
  const ending = IMAGE_TYPES[file.type]
  if (!ending) return { error: 'invalidType' }
  if (file.size > IMAGE_MAX_BYTES) return { error: 'tooLarge' }
  const board = await db.board.findUnique({ where: { id: boardId }, select: { backgroundImage: true } })
  if (!board) return { error: 'saveFailed' }
  const key = `boards/${boardId}/${randomUUID()}.${ending}`
  await saveStoredFile(key, Buffer.from(await file.arrayBuffer()))
  await db.board.update({ where: { id: boardId }, data: { backgroundImage: key } })
  if (board.backgroundImage) await deleteStoredFile(board.backgroundImage)
  await audit({ userId: admin.id, action: 'board.image', entity: 'Board', entityId: boardId })
  done()
  return { savedAt: Date.now() }
}

/** The photo taken away again: the board wears its colour. */
export async function removeBoardImage(boardId: string): Promise<void> {
  const admin = await requireAdmin()
  const board = await db.board.findUnique({ where: { id: boardId }, select: { backgroundImage: true } })
  if (!board?.backgroundImage) return
  await db.board.update({ where: { id: boardId }, data: { backgroundImage: null } })
  await deleteStoredFile(board.backgroundImage)
  await audit({ userId: admin.id, action: 'board.image.remove', entity: 'Board', entityId: boardId })
  done()
}
