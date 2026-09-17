import 'server-only'
import { db } from './db'
import { displayName } from './comments-db'

export type MentionItem = {
  id: string
  projectId: string
  number: string
  name: string
  author: string | null
  body: string
  createdAt: Date
  /** Written after the user last opened the list. */
  fresh: boolean
}

/**
 * The comments that name the user, newest first — the crew sees only what
 * the team may see — and how many came after the user last looked.
 */
export async function mentionsFor(user: {
  id: string
  role: string
  mentionsSeenAt: Date | null
}): Promise<{ items: MentionItem[]; unread: number }> {
  const rows = await db.note.findMany({
    where: { mentions: { has: user.id }, ...(user.role === 'EMPLOYEE' ? { visibility: 'TEAM' as const } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      body: true,
      createdAt: true,
      project: { select: { id: true, number: true, name: true } },
      author: { select: { username: true, employee: { select: { firstName: true, lastName: true } } } },
    },
  })
  const seen = user.mentionsSeenAt?.getTime() ?? 0
  const items = rows.map((row) => ({
    id: row.id,
    projectId: row.project.id,
    number: row.project.number,
    name: row.project.name,
    author: row.author ? displayName(row.author) : null,
    body: row.body,
    createdAt: row.createdAt,
    fresh: row.createdAt.getTime() > seen,
  }))
  return { items, unread: items.filter((i) => i.fresh).length }
}
