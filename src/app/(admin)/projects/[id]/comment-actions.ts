'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { isOffice, requireStaff } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { audit } from '@/lib/audit'
import { COMMENT_MAX, canDeleteComment, canEditComment, isReaction, mentionedUsers, type CommentResult } from '@/lib/comments'
import { createComment, mentionablePeople } from '@/lib/comments-db'

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
}

export async function addProjectComment(projectId: string, formData: FormData): Promise<CommentResult> {
  const user = await requireStaff()
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const result = await createComment({
    projectId,
    authorId: user.id,
    body: String(formData.get('body') ?? ''),
    // "Nur Büro" is the office's: a site manager's word is for the team.
    office: formData.get('office') === 'on' && user.role !== 'SITE_MANAGER',
    actor: { type: 'user', userId: user.id },
  })
  if ('error' in result) return { error: result.error === 'empty' ? 'empty' : 'saveFailed' }
  refresh(projectId)
  return {}
}

/** The author takes a comment back, or an administrator does. */
export async function deleteProjectComment(noteId: string): Promise<CommentResult> {
  const user = await requireStaff()
  const note = await db.note.findUnique({ where: { id: noteId }, select: { id: true, projectId: true, authorId: true, body: true } })
  if (!note) return { error: 'saveFailed' }
  if (!canDeleteComment(user, note) || !(await canWorkOn(user, note.projectId))) return { error: 'notAllowed' }
  await db.note.delete({ where: { id: noteId } })
  await audit({ userId: user.id, action: 'project.commentDeleted', entity: 'Project', entityId: note.projectId, oldValue: note.body.slice(0, 200) })
  refresh(note.projectId)
  return {}
}

/**
 * The author puts a comment right, the way a Trello comment is edited: the
 * text anew, the people it names worked out again, and "(bearbeitet)" beside
 * it from then on. Nobody else rewrites what somebody said.
 */
export async function editProjectComment(noteId: string, body: string): Promise<CommentResult> {
  const user = await requireStaff()
  const note = await db.note.findUnique({ where: { id: noteId }, select: { id: true, projectId: true, authorId: true, body: true } })
  if (!note) return { error: 'saveFailed' }
  if (!canEditComment(user, note) || !(await canWorkOn(user, note.projectId))) return { error: 'notAllowed' }
  const text = body.trim().slice(0, COMMENT_MAX)
  if (!text) return { error: 'empty' }
  if (text === note.body) return {}
  const mentions = mentionedUsers(text, await mentionablePeople()).map((p) => p.id)
  await db.note.update({ where: { id: noteId }, data: { body: text, mentions, editedAt: new Date() } })
  await audit({
    userId: user.id,
    action: 'project.commentEdited',
    entity: 'Project',
    entityId: note.projectId,
    oldValue: note.body.slice(0, 200),
    newValue: text.slice(0, 200),
  })
  refresh(note.projectId)
  return {}
}

/**
 * A sign under a comment — 👍 and the few others Trello offers first — given,
 * or taken back by giving it again. One of each per person; a comment kept
 * for the office is answered only by the office.
 */
export async function toggleCommentReaction(noteId: string, emoji: string): Promise<CommentResult> {
  const user = await requireStaff()
  if (!isReaction(emoji)) return { error: 'saveFailed' }
  const note = await db.note.findUnique({ where: { id: noteId }, select: { projectId: true, visibility: true } })
  if (!note) return { error: 'saveFailed' }
  if (!(await canWorkOn(user, note.projectId))) return { error: 'notAllowed' }
  if (note.visibility === 'MANAGEMENT' && !isOffice(user)) return { error: 'notAllowed' }
  const existing = await db.noteReaction.findUnique({
    where: { noteId_userId_emoji: { noteId, userId: user.id, emoji } },
    select: { id: true },
  })
  if (existing) await db.noteReaction.delete({ where: { id: existing.id } })
  else await db.noteReaction.create({ data: { noteId, userId: user.id, emoji } })
  refresh(note.projectId)
  return {}
}
