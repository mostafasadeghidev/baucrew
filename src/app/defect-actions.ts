'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { canDeleteDefect, parseDefectInput, type DefectResult } from '@/lib/defects'
import { createDefect, removeDefect, setDefectResolved } from '@/lib/defects-db'

/**
 * Defects, from the project page and from the crew's phone alike: one set of
 * actions, and the rule of who may do what written once.
 *
 * - Report: the office on any project; the crew on the projects it works on.
 *   Who puts it right and by when is the office's to say, so from the crew
 *   those two are left empty whatever was sent.
 * - Put right: whoever may report may tick it off. Taking the tick away again
 *   is the office's.
 * - Delete: the office any; the crew its own report while it is still open.
 */

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  revalidatePath('/my')
}

export async function reportDefect(projectId: string, formData: FormData): Promise<DefectResult> {
  const user = await requireUser()
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const office = user.role !== 'EMPLOYEE'
  const defect = parseDefectInput({
    title: formData.get('title'),
    description: formData.get('description'),
    location: formData.get('location'),
    dueDate: office ? formData.get('dueDate') : null,
    assigneeId: office ? formData.get('assigneeId') : null,
  })
  if (!defect) return { error: 'titleRequired' }
  const result = await createDefect({ projectId, reporterId: user.id, defect, actor: { type: 'user', userId: user.id } })
  if ('error' in result) return { error: 'notFound' }
  refresh(projectId)
  return { id: result.id }
}

export async function resolveDefect(id: string, resolved: boolean): Promise<DefectResult> {
  const user = await requireUser()
  const defect = await db.defect.findUnique({ where: { id }, select: { projectId: true } })
  if (!defect) return { error: 'notFound' }
  if (!(await canWorkOn(user, defect.projectId))) return { error: 'notAllowed' }
  if (!resolved && user.role === 'EMPLOYEE') return { error: 'notAllowed' }
  const result = await setDefectResolved({ id, userId: user.id, resolved, actor: { type: 'user', userId: user.id } })
  if ('error' in result) return { error: 'notFound' }
  refresh(result.projectId)
  return {}
}

export async function deleteDefect(id: string): Promise<DefectResult> {
  const user = await requireUser()
  const defect = await db.defect.findUnique({ where: { id }, select: { projectId: true, reportedById: true, resolvedAt: true } })
  if (!defect) return { error: 'notFound' }
  if (!canDeleteDefect(user, defect) || !(await canWorkOn(user, defect.projectId))) return { error: 'notAllowed' }
  const result = await removeDefect(id, user.id)
  if ('error' in result) return { error: 'notFound' }
  refresh(result.projectId)
  return {}
}
