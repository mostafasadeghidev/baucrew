// A project's folders — what its attachments and documentation are sorted
// into — as rules only: names, the tree, what a folder holds, who may change
// it. No server-only import, so it is unit-tested; the actions are
// src/app/folder-actions.ts.

export type FolderNode = { id: string; parentId: string | null; name: string }

/** A folder as the folder bar draws it, with whether the reader may rename or delete it. */
export type FolderView = FolderNode & { canChange: boolean }

/** A folder's name, at most this long. */
export const FOLDER_NAME_MAX = 80

/** How deep folders nest: deep enough for "Pläne / Statik / alt", shallow enough to find things on a phone. */
export const FOLDER_MAX_DEPTH = 4

/** A name as saved: one line, trimmed, path signs taken out. Null when nothing is left. */
export function cleanFolderName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FOLDER_NAME_MAX)
    .trim()
  return name || null
}

/** Whether a sibling of that folder already has the name, whatever its capitals. */
export function nameTaken(folders: readonly FolderNode[], parentId: string | null, name: string, exceptId?: string): boolean {
  const wanted = name.toLocaleLowerCase('de')
  return folders.some((f) => f.parentId === parentId && f.id !== exceptId && f.name.toLocaleLowerCase('de') === wanted)
}

/** The folders directly inside one, by name. */
export function childrenOf<T extends FolderNode>(folders: readonly T[], parentId: string | null): T[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
}

/** From the top down to the folder itself — what the breadcrumb shows. Empty for the top level or a folder not in the list. */
export function folderPath<T extends FolderNode>(folders: readonly T[], id: string | null): T[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: T[] = []
  const seen = new Set<string>()
  let current = id ? byId.get(id) : undefined
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}

/** How deep a folder lies: 1 for one at the top level. */
export function depthOf(folders: readonly FolderNode[], id: string | null): number {
  return folderPath(folders, id).length
}

/** The folder and every folder inside it, at any depth. */
export function subtreeIds(folders: readonly FolderNode[], id: string): Set<string> {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id)
        grew = true
      }
    }
  }
  return ids
}

/** How many things a folder holds, its subfolders' included — the number on its tile. */
export function folderCounts(folders: readonly FolderNode[], itemFolderIds: ReadonlyArray<string | null>): Map<string, number> {
  const direct = new Map<string, number>()
  for (const id of itemFolderIds) if (id) direct.set(id, (direct.get(id) ?? 0) + 1)
  const counts = new Map<string, number>()
  for (const f of folders) {
    let total = 0
    for (const id of subtreeIds(folders, f.id)) total += direct.get(id) ?? 0
    counts.set(f.id, total)
  }
  return counts
}

/** The whole tree as a flat list, each folder under its parent, with its depth — the "Verschieben nach…" list. */
export function flattenTree<T extends FolderNode>(folders: readonly T[]): Array<T & { depth: number }> {
  const out: Array<T & { depth: number }> = []
  const walk = (parentId: string | null, depth: number) => {
    for (const f of childrenOf(folders, parentId)) {
      out.push({ ...f, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/** Folders with every parent before its children — the order a backup is restored in. */
export function parentsFirst<T extends FolderNode>(folders: readonly T[]): T[] {
  const known = new Set(folders.map((f) => f.id))
  const placed = new Set<string>()
  const out: T[] = []
  let left = [...folders]
  while (left.length > 0) {
    const ready = left.filter((f) => !f.parentId || !known.has(f.parentId) || placed.has(f.parentId))
    // A loop the database cannot hold; kept anyway, last, so nothing is lost.
    const next = ready.length > 0 ? ready : left
    for (const f of next) {
      out.push(f)
      placed.add(f.id)
    }
    left = left.filter((f) => !placed.has(f.id))
  }
  return out
}

/**
 * What deleting a folder does: its files and its folders move to where it
 * lies itself. A subfolder whose name is already taken there gets a number,
 * "Pläne (2)", so nothing is merged unasked.
 */
export function planFolderDelete(
  folders: readonly FolderNode[],
  id: string
): { target: string | null; renames: Array<{ id: string; name: string }> } | null {
  const folder = folders.find((f) => f.id === id)
  if (!folder) return null
  const target = folder.parentId
  const staying = folders.filter((f) => f.id !== id)
  const renames: Array<{ id: string; name: string }> = []
  const names = staying.filter((f) => f.parentId === target).map((f) => f.name.toLocaleLowerCase('de'))
  for (const child of childrenOf(folders, id)) {
    let name = child.name
    let n = 2
    while (names.includes(name.toLocaleLowerCase('de'))) name = `${child.name} (${n++})`
    names.push(name.toLocaleLowerCase('de'))
    if (name !== child.name) renames.push({ id: child.id, name })
  }
  return { target, renames }
}

type Reader = { id: string; role: string }

const office = (user: Reader) => user.role === 'ADMIN' || user.role === 'MANAGER'

/**
 * Who renames or deletes a folder: the office any, everybody else the ones
 * they made — the crew sorts its own photos without tidying the office's plans away.
 */
export function canChangeFolder(user: Reader, folder: { createdById: string | null }): boolean {
  return office(user) || (folder.createdById !== null && folder.createdById === user.id)
}

/** A thing in a folder, as the move action names it. */
export type FolderItem = { kind: 'document' | 'entry'; id: string }

export function isFolderItem(value: unknown): value is FolderItem {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (v.kind === 'document' || v.kind === 'entry') && typeof v.id === 'string' && v.id.length > 0 && v.id.length < 64
}

/** The type a dragged file carries, so a drop knows it from a file from the computer or a card. */
export const FOLDER_DRAG_TYPE = 'application/x-baucrew-folder-item'
