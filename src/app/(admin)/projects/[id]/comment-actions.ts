'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { audit } from '@/lib/audit'
import { canDeleteComment, type CommentResult } from '@/lib/comments'
import { createComment } from '@/lib/comments-db'

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
