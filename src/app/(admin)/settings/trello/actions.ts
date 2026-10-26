'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/authz'
import { db } from '@/lib/db'
import { syncTrelloBoards, type TrelloSyncOutcome } from '@/lib/trello/auto-sync'

/** One board's switches, as the row's form sends them. */
export async function saveTrelloSyncBoard(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  if (!/^[0-9a-f]{24}$/.test(id)) return
  const customer = String(formData.get('oneCustomer') ?? 'auto')
  await db.trelloSyncBoard.update({
    where: { id },
    data: {
      enabled: formData.get('enabled') === 'on',
      includeArchived: formData.get('includeArchived') === 'on',
      makeBoard: formData.get('makeBoard') === 'on',
      oneCustomer: customer === 'yes' ? true : customer === 'no' ? false : null,
    },
  })
  revalidatePath('/settings/trello')
}

/** Runs the sync now — every board switched on, or the one named. */
export async function syncTrelloNowAction(boardId?: string): Promise<TrelloSyncOutcome> {
  const admin = await requireAdmin()
  const outcome = await syncTrelloBoards('manual', admin.id, boardId ? [boardId] : undefined)
  revalidatePath('/settings/trello')
  revalidatePath('/projects')
  revalidatePath('/customers')
  return outcome
}
