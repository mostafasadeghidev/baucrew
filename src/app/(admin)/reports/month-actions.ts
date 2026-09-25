'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { canViewFinancials, requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { monthInputValue, movedTo } from '@/lib/plan-month'
import { announceProjectChanges, projectBefore } from '@/lib/project-events'

/**
 * A project dragged into another month of the Planumsatz. Its fixed days move
 * by whole months and its placing follows (src/lib/plan-month.ts); the months'
 * sums are read afresh from the projects, so nothing else is kept. The office
 * does this — the same people who read the figures.
 */
export async function moveProjectMonth(projectId: string, year: number, month: number): Promise<{ error?: string }> {
  const user = await requireManagement()
  if (!canViewFinancials(user)) return { error: 'forbidden' }
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) return { error: 'invalid' }
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true, plannedStart: true, plannedEnd: true, planMonth: true, planMonths: true },
  })
  if (!project || project.status === 'CANCELLED') return { error: 'notFound' }

  const before = await projectBefore(projectId)
  const next = movedTo(project, { year, month })
  await db.project.update({ where: { id: projectId }, data: next })
  await audit({
    userId: user.id,
    action: 'project.update',
    entity: 'Project',
    entityId: projectId,
    field: 'planMonth',
    oldValue: monthInputValue(project.plannedStart ?? project.planMonth) || undefined,
    newValue: monthInputValue(next.planMonth),
  })
  await announceProjectChanges(before, { type: 'user', userId: user.id })
  revalidatePath('/reports')
  revalidatePath('/projects')
  revalidatePath(`/projects/${projectId}`)
  return {}
}
