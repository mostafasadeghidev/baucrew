import 'server-only'
import { db } from './db'
import { canSeeProject } from './project-scope'

/**
 * May this employee work on that project from the phone — book time, write a
 * comment, send a photo, report a defect? Whoever is on the project's crew, or
 * is scheduled on it from yesterday to a week ahead. The same rule everywhere,
 * so the phone never offers one thing and refuses the next.
 */
export async function canBookOn(projectId: string, employeeId: string): Promise<boolean> {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7))
  const [inTeam, scheduled] = await Promise.all([
    db.projectEmployee.count({ where: { projectId, employeeId } }),
    db.scheduleEntry.count({
      where: {
        projectId,
        cancelledAt: null,
        date: { gte: from, lte: to },
        employees: { some: { employeeId } },
      },
    }),
  ])
  return inTeam > 0 || scheduled > 0
}

/**
 * May this user do work on that project — tick a task, report a defect, sign
 * a form? The office on any; a site manager on the ones they are named on; an
 * employee on the ones the phone offers them, by the rule above.
 */
export async function canWorkOn(user: { role: string; employee: { id: string } | null }, projectId: string): Promise<boolean> {
  if (user.role === 'ADMIN' || user.role === 'MANAGER') return true
  if (user.role === 'SITE_MANAGER') return canSeeProject(user, projectId)
  return Boolean(user.employee) && (await canBookOn(projectId, user.employee!.id))
}
