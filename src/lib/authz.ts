import 'server-only'
import { redirect } from 'next/navigation'
import { getCurrentUser, type CurrentUser } from './auth'

/**
 * Who may go where.
 *
 * - ADMIN and MANAGER are the office: everything, the settings for the admin.
 * - SITE_MANAGER (Bauleitung) runs the sites they are named on: the overview,
 *   their projects, the schedule — never a price, never the master data. A page
 *   the office alone may open sends them to the projects.
 * - EMPLOYEE is the crew: the phone area and nothing of the office's.
 */

/** Redirects to /login when unauthenticated. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/** Admin or Manager — the office's own pages: master data, reports, imports, settings. */
export async function requireManagement(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role === 'EMPLOYEE') redirect('/my')
  if (user.role === 'SITE_MANAGER') redirect('/projects')
  return user
}

/** The office and the site managers — the administration area's frame, the projects, the schedule. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role === 'EMPLOYEE') redirect('/my')
  return user
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'ADMIN') redirect('/')
  return user
}

/** The office: admin or manager. */
export function isOffice(user: { role: string }): boolean {
  return user.role === 'ADMIN' || user.role === 'MANAGER'
}

/** Financial data (prices, revenue) is visible to admins and explicitly-granted managers. */
export function canViewFinancials(user: CurrentUser): boolean {
  return user.role === 'ADMIN' || (user.role === 'MANAGER' && user.canViewFinancials)
}
