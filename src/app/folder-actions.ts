'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { audit } from '@/lib/audit'
import {
  FOLDER_MAX_DEPTH,
  canChangeFolder,
  cleanFolderName,
  depthOf,
  isFolderItem,
  nameTaken,
  planFolderDelete,
  type FolderItem,
} from '@/lib/folders'

/**
 * A project's folders, from the card, the project page and the crew's phone
 * alike. What may be done:
 *
 * - Make a folder, move files between folders: whoever may work on the
 *   project (`canWorkOn`). The crew moves only what it can see — the
 *   documentation, and the attachments the office shows the crew.
 * - Rename or delete a folder: the office any, everybody else their own
 *   (`canChangeFolder`). Deleting moves what is in it one level up; no file
 *   is ever deleted with a folder.
 */

export type FolderResult = { error?: 'notAllowed' | 'notFound' | 'empty' | 'taken' | 'tooDeep' }

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/my')
}

const projectFolders = (projectId: string) =>
  db.projectFolder.findMany({ where: { projectId }, select: { id: true, parentId: true, name: true, createdById: true } })

export async function createFolder(projectId: string, parentId: string | null, rawName: string): Promise<FolderResult & { id?: string }> {
  const user = await requireUser()
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const name = cleanFolderName(rawName)
  if (!name) return { error: 'empty' }
  const folders = await projectFolders(projectId)
  if (parentId && !folders.some((f) => f.id === parentId)) return { error: 'notFound' }
  if (depthOf(folders, parentId) >= FOLDER_MAX_DEPTH) return { error: 'tooDeep' }
  if (nameTaken(folders, parentId, name)) return { error: 'taken' }
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) return { error: 'notFound' }
  const folder = await db.projectFolder.create({ data: { projectId, parentId, name, createdById: user.id }, select: { id: true } })
  await audit({ userId: user.id, action: 'project.folder.add', entity: 'Project', entityId: projectId, newValue: name })
  refresh(projectId)
  return { id: folder.id }
}

/**
 * The folders a project starts with, in one go — offered while it has none.
 * The names come from the page in the reader's language.
 */
export async function createStarterFolders(projectId: string, rawNames: string[]): Promise<FolderResult> {
  const user = await requireUser()
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  if ((await db.projectFolder.count({ where: { projectId } })) > 0) return {}
  const names = [...new Set(rawNames.slice(0, 8).map(cleanFolderName).filter((n): n is string => n !== null))]
  if (names.length === 0) return { error: 'empty' }
  await db.projectFolder.createMany({ data: names.map((name) => ({ projectId, parentId: null, name, createdById: user.id })) })
  await audit({ userId: user.id, action: 'project.folder.add', entity: 'Project', entityId: projectId, newValue: names.join(', ') })
  refresh(projectId)
  return {}
}

export async function renameFolder(folderId: string, rawName: string): Promise<FolderResult> {
  const user = await requireUser()
  const folder = await db.projectFolder.findUnique({ where: { id: folderId }, select: { id: true, projectId: true, parentId: true, name: true, createdById: true } })
  if (!folder) return { error: 'notFound' }
  if (!canChangeFolder(user, folder) || !(await canWorkOn(user, folder.projectId))) return { error: 'notAllowed' }
  const name = cleanFolderName(rawName)
  if (!name) return { error: 'empty' }
  if (name === folder.name) return {}
  if (nameTaken(await projectFolders(folder.projectId), folder.parentId, name, folder.id)) return { error: 'taken' }
  await db.projectFolder.update({ where: { id: folderId }, data: { name } })
  await audit({ userId: user.id, action: 'project.folder.rename', entity: 'Project', entityId: folder.projectId, oldValue: folder.name, newValue: name })
  refresh(folder.projectId)
  return {}
}

/** A folder taken away: what it held — files, entries, folders — moves to where it lay. */
export async function deleteFolder(folderId: string): Promise<FolderResult> {
  const user = await requireUser()
  const folder = await db.projectFolder.findUnique({ where: { id: folderId }, select: { id: true, projectId: true, name: true, createdById: true } })
  if (!folder) return { error: 'notFound' }
  if (!canChangeFolder(user, folder) || !(await canWorkOn(user, folder.projectId))) return { error: 'notAllowed' }
  const plan = planFolderDelete(await projectFolders(folder.projectId), folderId)
  if (!plan) return { error: 'notFound' }
  await db.$transaction([
    ...plan.renames.map((r) => db.projectFolder.update({ where: { id: r.id }, data: { name: r.name } })),
    db.projectFolder.updateMany({ where: { parentId: folderId }, data: { parentId: plan.target } }),
    db.document.updateMany({ where: { folderId }, data: { folderId: plan.target } }),
    db.documentationEntry.updateMany({ where: { folderId }, data: { folderId: plan.target } }),
    db.projectFolder.delete({ where: { id: folderId } }),
  ])
  await audit({ userId: user.id, action: 'project.folder.delete', entity: 'Project', entityId: folder.projectId, oldValue: folder.name })
  refresh(folder.projectId)
  return {}
}

/** Files and documentation entries into a folder — or to the top level with `folderId` null. */
export async function moveToFolder(projectId: string, rawItems: FolderItem[], folderId: string | null): Promise<FolderResult> {
  const user = await requireUser()
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const items = (Array.isArray(rawItems) ? rawItems : []).filter(isFolderItem).slice(0, 200)
  if (items.length === 0) return {}
  if (folderId) {
    const folder = await db.projectFolder.findUnique({ where: { id: folderId }, select: { projectId: true } })
    if (folder?.projectId !== projectId) return { error: 'notFound' }
  }
  const documentIds = items.filter((i) => i.kind === 'document').map((i) => i.id)
  const entryIds = items.filter((i) => i.kind === 'entry').map((i) => i.id)
  // Only what belongs to this project — and, for the crew, what the crew can see.
  const crew = user.role === 'EMPLOYEE'
  await db.$transaction([
    db.document.updateMany({ where: { id: { in: documentIds }, projectId, ...(crew ? { visibleToCrew: true } : {}) }, data: { folderId } }),
    db.documentationEntry.updateMany({ where: { id: { in: entryIds }, projectId }, data: { folderId } }),
  ])
  refresh(projectId)
  return {}
}
