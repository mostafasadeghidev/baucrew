import 'server-only'
import { db } from './db'
import { audit } from './audit'
import { COMMENT_MAX, mentionedUsers, type Mentionable } from './comments'
import { announceCommentCreated, type EventActor } from './project-events'

/** Everybody who can be named with @: the active accounts, called by their person's name when they have one. */
export async function mentionablePeople(): Promise<Mentionable[]> {
  const users = await db.user.findMany({
    where: { active: true },
    orderBy: { username: 'asc' },
    select: { id: true, username: true, employee: { select: { firstName: true, lastName: true } } },
  })
  return users.map((u) => ({ id: u.id, username: u.username, name: displayName(u) }))
}

export function displayName(user: { username: string; employee: { firstName: string; lastName: string } | null }): string {
  return user.employee ? `${user.employee.firstName} ${user.employee.lastName}`.trim() : user.username
}

/**
 * A comment written on a project — from the page, the sheet or the API —
 * with the people it names worked out, and told to the automations.
 */
export async function createComment(input: {
  projectId: string
  authorId: string
  body: string
  office: boolean
  actor: EventActor
}): Promise<{ id: string } | { error: 'empty' | 'notFound' }> {
  const body = input.body.trim().slice(0, COMMENT_MAX)
  if (!body) return { error: 'empty' }
  const project = await db.project.findUnique({ where: { id: input.projectId }, select: { id: true } })
  if (!project) return { error: 'notFound' }
  const mentions = mentionedUsers(body, await mentionablePeople()).map((p) => p.id)
  const note = await db.note.create({
    data: {
      projectId: project.id,
      authorId: input.authorId,
      body,
      visibility: input.office ? 'MANAGEMENT' : 'TEAM',
      mentions,
    },
    select: { id: true },
  })
  await audit({
    userId: input.authorId,
    action: 'project.comment',
    entity: 'Project',
    entityId: project.id,
    newValue: body.slice(0, 200),
  })
  await announceCommentCreated(note.id, input.actor)
  return { id: note.id }
}
