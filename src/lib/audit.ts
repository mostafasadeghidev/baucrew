import 'server-only'
import { db } from './db'

/**
 * Records a change in the audit log. Best-effort: audit failures must never
 * break the actual operation.
 */
export async function audit(params: {
  userId: string | null
  action: string
  entity: string
  entityId: string
  field?: string
  oldValue?: string | null
  newValue?: string | null
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        field: params.field,
        oldValue: params.oldValue ?? undefined,
        newValue: params.newValue ?? undefined,
      },
    })
  } catch (e) {
    console.error('audit log failed', e)
  }
}
