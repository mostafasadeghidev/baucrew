import 'server-only'
import { redirect } from 'next/navigation'
import { getCurrentUser, type CurrentUser } from './auth'

/** Redirects to /login when unauthenticated. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/** Admin or Manager — the administration area. */
export async function requireManagement(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role === 'EMPLOYEE') redirect('/my')
  return user
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'ADMIN') redirect('/')
  return user
}

/** Financial data (prices, revenue) is visible to admins and explicitly-granted managers. */
export function canViewFinancials(user: CurrentUser): boolean {
  return user.role === 'ADMIN' || (user.role === 'MANAGER' && user.canViewFinancials)
}
