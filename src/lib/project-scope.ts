import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { db } from './db'

type Who = { role: string; employee: { id: string } | null }

/**
 * Which projects a user sees in the administration area. The office every
 * one; a site manager those they are named on — as the site manager, or in
 * the crew. Null means no narrowing at all, so a query can spread it in.
 */
export function projectScope(user: Who): Prisma.ProjectWhereInput | null {
  if (user.role !== 'SITE_MANAGER') return null
  // A site manager without a person behind the account is named on nothing.
  if (!user.employee) return { id: { in: [] } }
  const employeeId = user.employee.id
  return { OR: [{ managerId: employeeId }, { team: { some: { employeeId } } }] }
}

/** Whether one project is among those the user sees. */
export async function canSeeProject(user: Who, projectId: string): Promise<boolean> {
  const scope = projectScope(user)
  if (!scope) return true
  return (await db.project.count({ where: { AND: [{ id: projectId }, scope] } })) > 0
}
