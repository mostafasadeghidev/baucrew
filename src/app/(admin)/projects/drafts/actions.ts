'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'

export async function dismissDraft(
  id: string,
  _prev: { error?: string },
  _formData: FormData
): Promise<{ error?: string }> {
  const user = await requireManagement()
  const draft = await db.projectDraft.findUnique({ where: { id } })
  if (!draft) return { error: 'saveFailed' }
  await db.projectDraft.update({ where: { id }, data: { status: 'dismissed' } })
  await audit({
    userId: user.id,
    action: 'draft.dismiss',
    entity: 'System',
    entityId: id,
    oldValue: draft.name,
  })
  revalidatePath('/projects/drafts')
  revalidatePath('/projects')
  return {}
}
