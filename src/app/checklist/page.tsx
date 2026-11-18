import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/authz'

/**
 * The old shared progress list. Its entries moved into the feedback tool
 * (migration 20261031120100_feedback_checklist_entries) and kept their numbers;
 * the address stays so old links and bookmarks land there.
 */
export default async function ChecklistPage() {
  const user = await requireUser()
  redirect(user.role === 'EMPLOYEE' ? '/my/feedback' : '/feedback')
}
