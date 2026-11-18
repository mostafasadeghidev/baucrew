'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { audit } from '@/lib/audit'
import { canDeleteDocEntry, canEditDocEntry, cleanDocText } from '@/lib/documentation'
import { createDocEntry, deleteDocEntry, findDocEntry, transcribeDocEntry } from '@/lib/documentation-db'
import { folderInProject } from '@/lib/folders-db'
import { renamedFile } from '@/lib/card-links'

/**
 * A project's documentation, from the card, the project page and the crew's
 * phone alike. Files come in through POST /api/projects/<id>/documentation;
 * what has no file — a written note, words put right, an entry taken back, a
 * voice note written out again — goes through here.
 *
 * - Add: whoever may work on the project (`canWorkOn`).
 * - Put words right: the author, and the office (`canEditDocEntry`).
 * - Delete: the author, and the office (`canDeleteDocEntry`).
 */

export type DocActionResult = { error?: 'notAllowed' | 'notFound' | 'empty' }

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/my')
}

export async function addDocNote(projectId: string, rawText: string, folderId: string | null = null): Promise<DocActionResult> {
  const user = await requireUser()
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const text = cleanDocText(rawText)
  if (!text) return { error: 'empty' }
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) return { error: 'notFound' }
  await createDocEntry({ projectId, authorId: user.id, kind: 'TEXT', text, folderId: await folderInProject(projectId, folderId) })
  refresh(projectId)
  return {}
}

export async function editDocText(entryId: string, rawText: string): Promise<DocActionResult> {
  const user = await requireUser()
  const entry = await findDocEntry(entryId)
  if (!entry) return { error: 'notFound' }
  if (!canEditDocEntry(user, entry) || !(await canWorkOn(user, entry.projectId))) return { error: 'notAllowed' }
  const text = cleanDocText(rawText)
  // A note without words is no note; a voice note keeps its sound with none.
  if (!text && entry.kind === 'TEXT') return { error: 'empty' }
  if (text === entry.text) return {}
  await db.documentationEntry.update({ where: { id: entryId }, data: { text, editedAt: new Date() } })
  await audit({
    userId: user.id,
    action: 'project.documentation.edit',
    entity: 'Project',
    entityId: entry.projectId,
    oldValue: entry.text?.slice(0, 200) ?? null,
    newValue: text?.slice(0, 200) ?? null,
  })
  refresh(entry.projectId)
  return {}
}

export async function removeDocEntry(entryId: string): Promise<DocActionResult> {
  const user = await requireUser()
  const entry = await findDocEntry(entryId)
  if (!entry) return { error: 'notFound' }
  if (!canDeleteDocEntry(user, entry) || !(await canWorkOn(user, entry.projectId))) return { error: 'notAllowed' }
  await deleteDocEntry(entry, user.id)
  refresh(entry.projectId)
  return {}
}

/** "Erneut verschriftlichen": a voice note whose transcript failed, or was recorded before the key was set. */
export async function retranscribeDocEntry(entryId: string): Promise<DocActionResult & { transcription?: 'DONE' | 'FAILED' | 'OFF' }> {
  const user = await requireUser()
  const entry = await findDocEntry(entryId)
  if (!entry || entry.kind !== 'VOICE') return { error: 'notFound' }
  if (!(await canWorkOn(user, entry.projectId))) return { error: 'notAllowed' }
  const transcription = await transcribeDocEntry(entryId)
  refresh(entry.projectId)
  return { transcription }
}

/**
 * A documentation file's name changed — a PDF's, a recording's, a photo's —
 * its ending kept when the new name leaves it off. Who may change the entry's
 * words may change its files' names: the author and the office.
 */
export async function renameDocFile(fileId: string, typed: string): Promise<DocActionResult> {
  const user = await requireUser()
  const file = await db.documentationFile.findUnique({
    where: { id: fileId },
    select: { filename: true, entry: { select: { projectId: true, authorId: true } } },
  })
  if (!file) return { error: 'notFound' }
  if (!canDeleteDocEntry(user, file.entry) || !(await canWorkOn(user, file.entry.projectId))) return { error: 'notAllowed' }
  const filename = renamedFile(file.filename, typed)
  if (!filename) return { error: 'empty' }
  if (filename === file.filename) return {}
  await db.documentationFile.update({ where: { id: fileId }, data: { filename } })
  await audit({ userId: user.id, action: 'project.documentation.rename', entity: 'Project', entityId: file.entry.projectId, oldValue: file.filename, newValue: filename })
  refresh(file.entry.projectId)
  return {}
}
