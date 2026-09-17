'use server'

import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'

/** The user opened the list of comments naming them: nothing in it is new any more. */
export async function markMentionsSeen(): Promise<void> {
  const user = await requireUser()
  await db.user.update({ where: { id: user.id }, data: { mentionsSeenAt: new Date() } })
}
