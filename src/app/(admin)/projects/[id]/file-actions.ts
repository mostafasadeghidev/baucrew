'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { deleteStoredFile } from '@/lib/file-storage'

/** Show/hide a file for the crew accounts (worker area, kiosk). */
export async function toggleFileVisibility(fileId: string): Promise<void> {
  const user = await requireManagement()
  const doc = await db.document.findUnique({ where: { id: fileId } })
  if (!doc) return
  await db.document.update({
    where: { id: fileId },
    data: { visibleToCrew: !doc.visibleToCrew },
  })
  await audit({
    userId: user.id,
    action: 'project.file.visibility',
    entity: 'Project',
    entityId: doc.projectId,
    field: doc.filename,
    oldValue: doc.visibleToCrew ? 'crew' : 'office',
    newValue: doc.visibleToCrew ? 'office' : 'crew',
  })
  revalidatePath(`/projects/${doc.projectId}`)
  revalidatePath('/my')
}

export async function deleteProjectFile(
  fileId: string,
  _prev: { error?: string },
  _formData: FormData
): Promise<{ error?: string }> {
  const user = await requireManagement()
  const doc = await db.document.findUnique({ where: { id: fileId } })
  if (!doc) return { error: 'saveFailed' }
  await db.document.delete({ where: { id: fileId } })
  await deleteStoredFile(doc.path)
  await audit({
    userId: user.id,
    action: 'project.file.delete',
    entity: 'Project',
    entityId: doc.projectId,
    oldValue: doc.filename,
  })
  revalidatePath(`/projects/${doc.projectId}`)
  revalidatePath('/my')
  return {}
}
