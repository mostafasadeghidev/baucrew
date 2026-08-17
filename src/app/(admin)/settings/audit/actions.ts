'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'

type DeleteState = { error?: string }

/**
 * Clears the audit log — either everything or only entries older than
 * `olderThanDays`. The clearing itself is logged so there is always a trace.
 */
export async function clearAuditLog(olderThanDays: number | null, _prev: DeleteState, _formData: FormData): Promise<DeleteState> {
  const admin = await requireAdmin()
  const where =
    olderThanDays && olderThanDays > 0
      ? { createdAt: { lt: new Date(Date.now() - olderThanDays * 86_400_000) } }
      : {}
  const { count } = await db.auditLog.deleteMany({ where })
  await audit({
    userId: admin.id,
    action: 'settings.auditClear',
    entity: 'System',
    entityId: 'audit',
    newValue: olderThanDays ? `${count} (> ${olderThanDays} Tage)` : `${count} (alle)`,
  })
  revalidatePath('/settings/audit')
  return {}
}
