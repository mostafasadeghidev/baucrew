import 'server-only'
import { db } from './db'
import { readStoredFile, saveStoredFile } from './file-storage'
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION, delegateName } from './backup-tables'

// The whole installation as one JSON file, and back again. Every table the
// app has (see backup-tables.ts) and the files behind the documents, so a
// backup taken on one installation stands up the same thing on another.

type Delegate = {
  findMany: () => Promise<unknown[]>
  deleteMany: () => Promise<unknown>
  createMany: (args: { data: never[] }) => Promise<unknown>
}

const delegate = (model: string): Delegate =>
  (db as unknown as Record<string, Delegate>)[delegateName(model)]

export type BackupFile = {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  tables: Record<string, unknown[]>
  /** The documents' files, base64 — version 2 and later. */
  files?: Array<{ path: string; data: string }>
}

/** Everything, read in dependency order. */
export async function exportBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {}
  for (const t of BACKUP_TABLES) tables[t.key] = await delegate(t.model).findMany()

  const files: BackupFile['files'] = []
  for (const doc of tables.documents as Array<{ path: string }>) {
    try {
      files.push({ path: doc.path, data: (await readStoredFile(doc.path)).toString('base64') })
    } catch {
      // A file that is gone from the disk is not a reason to stop the backup;
      // the document row still says it existed.
    }
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables, files }
}

/** Whether a parsed file is a backup this app can restore. */
export function isBackupFile(parsed: unknown): parsed is BackupFile {
  if (typeof parsed !== 'object' || parsed === null) return false
  const p = parsed as Record<string, unknown>
  return (
    p.format === BACKUP_FORMAT &&
    typeof p.version === 'number' &&
    p.version >= 1 &&
    p.version <= BACKUP_VERSION &&
    typeof p.tables === 'object' &&
    p.tables !== null &&
    (p.files === undefined || Array.isArray(p.files))
  )
}

/**
 * Replaces everything with the backup, in one transaction: the tables are
 * emptied children first and filled parents first, so nothing is left half
 * done. Every session goes too — everyone signs in again. A table the file
 * does not have (an older backup) ends up empty. The files are written
 * afterwards; a document whose file is missing from the backup keeps its row.
 */
export async function restoreFromBackup(backup: BackupFile): Promise<void> {
  const rows = (key: string): never[] => {
    const v = backup.tables[key]
    return Array.isArray(v) ? (v as never[]) : []
  }
  await db.$transaction([
    db.session.deleteMany(),
    ...[...BACKUP_TABLES].reverse().map((t) => delegate(t.model).deleteMany()),
    ...BACKUP_TABLES.filter((t) => rows(t.key).length > 0).map((t) => delegate(t.model).createMany({ data: rows(t.key) })),
  ] as never[])

  for (const file of backup.files ?? []) {
    if (typeof file?.path !== 'string' || typeof file?.data !== 'string') continue
    await saveStoredFile(file.path, Buffer.from(file.data, 'base64'))
  }
}
