'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { audit } from '@/lib/audit'
import { deleteStoredFile } from '@/lib/file-storage'

/** Show/hide a file for the crew accounts (worker area, kiosk). */
export async function toggleFileVisibility(fileId: string): Promise<void> {
  const user = await requireStaff()
  const doc = await db.document.findUnique({ where: { id: fileId } })
  if (!doc) return
  if (!(await canWorkOn(user, doc.projectId))) return
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
  const user = await requireStaff()
  const doc = await db.document.findUnique({ where: { id: fileId } })
  if (!doc) return { error: 'saveFailed' }
  if (!(await canWorkOn(user, doc.projectId))) return { error: 'saveFailed' }
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

/**
 * The picture on the front of the card — one of the project's own photos, or
 * none again. What a Trello card calls its cover.
 */
export async function setProjectCover(projectId: string, fileId: string | null): Promise<{ error?: string }> {
  const user = await requireStaff()
  if (!(await canWorkOn(user, projectId))) return { error: 'saveFailed' }
  if (fileId) {
    const doc = await db.document.findUnique({ where: { id: fileId }, select: { projectId: true, mimeType: true, filename: true } })
    if (!doc || doc.projectId !== projectId || !doc.mimeType.startsWith('image/')) return { error: 'saveFailed' }
  }
  await db.project.update({ where: { id: projectId }, data: { coverDocumentId: fileId } })
  await audit({
    userId: user.id,
    action: fileId ? 'project.cover.set' : 'project.cover.clear',
    entity: 'Project',
    entityId: projectId,
    newValue: fileId ?? undefined,
  })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  return {}
}
