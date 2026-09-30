'use server'

import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'
import { markCardNotificationsRead, markNotificationsRead } from '@/lib/notifications-db'

/** The user opened the bell: nothing in it is new any more — the comments naming them, and the cards' news. */
export async function markMentionsSeen(): Promise<void> {
  const user = await requireUser()
  await db.user.update({ where: { id: user.id }, data: { mentionsSeenAt: new Date() } })
  await markNotificationsRead(user.id)
}

/** The user opened a card: its red bell goes out, and its lines in the bell are no longer new. */
export async function markCardSeen(projectId: string): Promise<void> {
  const user = await requireUser()
  if (typeof projectId !== 'string' || !projectId) return
  await markCardNotificationsRead(user.id, projectId)
}
