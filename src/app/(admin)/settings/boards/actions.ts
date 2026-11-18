'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { deleteStoredFile, saveStoredFile } from '@/lib/file-storage'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { RECORD_ID } from '@/lib/boards'
import { saveBoardDraft } from '@/lib/boards-db'
import { cleanBoardDraft, cleanBoardOrder, type DraftError } from '@/lib/board-draft'

function done() {
  revalidatePath('/projects')
  // Baustellen shows the board with the tick.
  revalidatePath('/sites')
  revalidatePath('/settings/boards')
}

/**
 * A board saved from the settings window — made, or changed — all at once:
 * its name, its colour, and its columns in their order with their names and
 * statuses (src/lib/board-draft.ts). Administrators only, as making and
 * deleting boards always was; the lists on the board itself stay the office's.
 */
export async function saveBoardSettings(id: string | null, draft: unknown): Promise<{ id?: string; error?: DraftError | 'notFound' }> {
  const admin = await requireAdmin()
  if (id !== null && !RECORD_ID.test(id)) return { error: 'notFound' }
  const clean = cleanBoardDraft(draft)
  if ('error' in clean) return { error: clean.error }
  const before = id ? await db.board.findUnique({ where: { id }, select: { name: true } }) : null
  if (id && !before) return { error: 'notFound' }
  const saved = await saveBoardDraft(id, clean.board)
  if (!saved) return { error: 'notFound' }
  await audit({
    userId: admin.id,
    action: id ? 'board.update' : 'board.create',
    entity: 'Board',
    entityId: saved,
    oldValue: before?.name ?? null,
    newValue: `${clean.board.name}: ${clean.board.columns.map((c) => (c.rule ? `${c.status}:${c.rule}` : c.status)).join(',')}`,
  })
  done()
  return { id: saved }
}

/** The boards' tabs in the order they were dragged into. */
export async function reorderBoards(ids: string[]): Promise<{ error?: 'saveFailed' }> {
  const admin = await requireAdmin()
  const boards = await db.board.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } })
  const order = cleanBoardOrder(ids, boards.map((b) => b.id))
  await db.$transaction(order.map((boardId, sortOrder) => db.board.update({ where: { id: boardId }, data: { sortOrder } })))
  await audit({ userId: admin.id, action: 'board.order', entity: 'Board', entityId: order[0] ?? '', newValue: order.join(',') })
  done()
  return {}
}

/**
 * A board away. The last board stays: a projects page with no board is a page
 * with nothing on it. Its photo was its alone and goes with it. The projects
 * on it stay — a board is a view of them, never where they are kept.
 */
export async function removeBoard(id: string): Promise<{ error?: 'lastBoard' | 'notFound' }> {
  const admin = await requireAdmin()
  if ((await db.board.count()) <= 1) return { error: 'lastBoard' }
  const board = await db.board.findUnique({ where: { id }, select: { name: true, backgroundImage: true } })
  if (!board) return { error: 'notFound' }
  await db.board.delete({ where: { id } })
  if (board.backgroundImage) await deleteStoredFile(board.backgroundImage)
  await audit({ userId: admin.id, action: 'board.delete', entity: 'Board', entityId: id, oldValue: board.name })
  done()
  return {}
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
