import 'server-only'
import { db } from './db'

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
