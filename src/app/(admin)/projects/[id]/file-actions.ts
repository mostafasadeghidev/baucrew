'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { audit } from '@/lib/audit'
import { deleteStoredFile } from '@/lib/file-storage'
import { linkLabel, normalizeLink, renamedFile } from '@/lib/card-links'

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

/** The same, from a menu rather than a form: the attachments' "…" on a card. */
export async function removeProjectFile(fileId: string): Promise<{ error?: string }> {
  return deleteProjectFile(fileId, {}, new FormData())
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

// ── Links attached beside the files, and names changed — Trello's "Anhängen" ──

type LinkResult = { error?: 'invalidLink' | 'saveFailed' }

/** A web address attached to the card, with the words it is shown with. */
export async function addCardLink(projectId: string, rawUrl: string, rawTitle: string): Promise<LinkResult> {
  const user = await requireStaff()
  if (!(await canWorkOn(user, projectId))) return { error: 'saveFailed' }
  const url = normalizeLink(rawUrl)
  if (!url) return { error: 'invalidLink' }
  const title = rawTitle.trim().slice(0, 200) || null
  await db.cardLink.create({ data: { projectId, url, title, createdById: user.id } })
  await audit({ userId: user.id, action: 'project.link.add', entity: 'Project', entityId: projectId, newValue: linkLabel(url, title) })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  return {}
}

/** A link's address or words changed from its "…". */
export async function editCardLink(linkId: string, rawUrl: string, rawTitle: string): Promise<LinkResult> {
  const user = await requireStaff()
  const link = await db.cardLink.findUnique({ where: { id: linkId } })
  if (!link || !(await canWorkOn(user, link.projectId))) return { error: 'saveFailed' }
  const url = normalizeLink(rawUrl)
  if (!url) return { error: 'invalidLink' }
  const title = rawTitle.trim().slice(0, 200) || null
  await db.cardLink.update({ where: { id: linkId }, data: { url, title } })
  revalidatePath(`/projects/${link.projectId}`)
  revalidatePath('/projects')
  return {}
}

export async function removeCardLink(linkId: string): Promise<LinkResult> {
  const user = await requireStaff()
  const link = await db.cardLink.findUnique({ where: { id: linkId } })
  if (!link || !(await canWorkOn(user, link.projectId))) return { error: 'saveFailed' }
  await db.cardLink.delete({ where: { id: linkId } })
  await audit({ userId: user.id, action: 'project.link.remove', entity: 'Project', entityId: link.projectId, oldValue: linkLabel(link.url, link.title) })
  revalidatePath(`/projects/${link.projectId}`)
  revalidatePath('/projects')
  return {}
}

/** A file's name changed from its "…" — its ending kept when the new name leaves it off. */
export async function renameProjectFile(fileId: string, typed: string): Promise<{ error?: 'saveFailed' }> {
  const user = await requireStaff()
  const doc = await db.document.findUnique({ where: { id: fileId }, select: { projectId: true, filename: true } })
  if (!doc || !(await canWorkOn(user, doc.projectId))) return { error: 'saveFailed' }
  const filename = renamedFile(doc.filename, typed)
  if (!filename) return { error: 'saveFailed' }
  if (filename === doc.filename) return {}
  await db.document.update({ where: { id: fileId }, data: { filename } })
  await audit({ userId: user.id, action: 'project.file.rename', entity: 'Project', entityId: doc.projectId, oldValue: doc.filename, newValue: filename })
  revalidatePath(`/projects/${doc.projectId}`)
  revalidatePath('/projects')
  return {}
}
