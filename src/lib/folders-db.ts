import 'server-only'
import { db } from './db'
import { canChangeFolder, type FolderView } from './folders'

/** A project's folders as the folder bar draws them, with what the reader may do to each. */
export async function foldersFor(projectId: string, reader: { id: string; role: string }): Promise<FolderView[]> {
  const rows = await db.projectFolder.findMany({
    where: { projectId },
    select: { id: true, parentId: true, name: true, createdById: true },
    orderBy: { name: 'asc' },
  })
  return rows.map((f) => ({ id: f.id, parentId: f.parentId, name: f.name, canChange: canChangeFolder(reader, f) }))
}

/**
 * A folder at the top level by its name, made when there is none — where
 * the photos of the project's tasks are put ("Aufgaben").
 */
export async function rootFolderNamed(projectId: string, name: string, createdById: string): Promise<string> {
  const wanted = name.toLocaleLowerCase('de')
  const roots = await db.projectFolder.findMany({ where: { projectId, parentId: null }, select: { id: true, name: true } })
  const found = roots.find((f) => f.name.toLocaleLowerCase('de') === wanted)
  if (found) return found.id
  const folder = await db.projectFolder.create({ data: { projectId, parentId: null, name, createdById }, select: { id: true } })
  return folder.id
}

/**
 * The folder a new file or entry is put into, when one was named: only a
 * folder of that very project counts; anything else is the top level.
 */
export async function folderInProject(projectId: string, raw: unknown): Promise<string | null> {
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (!id) return null
  const folder = await db.projectFolder.findUnique({ where: { id }, select: { projectId: true } })
  return folder?.projectId === projectId ? id : null
}
