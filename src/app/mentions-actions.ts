'use server'

import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'
import { markNotificationsRead } from '@/lib/notifications-db'

/** The user opened the bell: nothing in it is new any more — the comments naming them, and the cards' news. */
export async function markMentionsSeen(): Promise<void> {
  const user = await requireUser()
  await db.user.update({ where: { id: user.id }, data: { mentionsSeenAt: new Date() } })
  await markNotificationsRead(user.id)
}
