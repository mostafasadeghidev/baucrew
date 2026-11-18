import 'server-only'
import { randomUUID } from 'crypto'
import { db } from './db'
import { audit } from './audit'
import { displayName } from './comments-db'
import { deleteStoredFile, readStoredFile, saveStoredFile } from './file-storage'
import { safeFileName } from './files'
import { transcribeRecording, transcriptionModel } from './transcription'
import { canDeleteDocEntry, canEditDocEntry, type DocKind } from './documentation'

/** A file on its way in: already checked, named and typed. */
export type IncomingDocFile = { name: string; mimeType: string; data: Buffer; durationMs?: number | null }

/** Where a documentation file lives in storage/: beside the project's documents, in a folder of its own. */
export function docStorageKey(projectId: string, fileName: string): string {
  return `${projectId}/doku/${randomUUID()}-${safeFileName(fileName)}`
}

/**
 * One new entry: its files written to storage first, then the row. A voice
 * note starts as PENDING when there is a key to write it out with, OFF when
 * there is none.
 */
export async function createDocEntry(input: {
  projectId: string
  authorId: string
  kind: DocKind
  text?: string | null
  files?: IncomingDocFile[]
  /** The project folder it goes into; null = the top level. */
  folderId?: string | null
}) {
  const files = input.files ?? []
  const stored: Array<{ filename: string; mimeType: string; size: number; path: string; durationMs: number | null; sortOrder: number }> = []
  try {
    for (const [index, file] of files.entries()) {
      const path = docStorageKey(input.projectId, file.name)
      await saveStoredFile(path, file.data)
      stored.push({ filename: safeFileName(file.name), mimeType: file.mimeType, size: file.data.length, path, durationMs: file.durationMs ?? null, sortOrder: index })
    }
    const entry = await db.documentationEntry.create({
      data: {
        projectId: input.projectId,
        authorId: input.authorId,
        kind: input.kind,
        text: input.text ?? null,
        folderId: input.folderId ?? null,
        transcription: input.kind === 'VOICE' ? (transcriptionModel() ? 'PENDING' : 'OFF') : null,
        files: { create: stored },
      },
      select: { id: true, transcription: true },
    })
    await audit({
      userId: input.authorId,
      action: 'project.documentation.add',
      entity: 'Project',
      entityId: input.projectId,
      newValue: stored.length > 0 ? stored.map((s) => s.filename).join(', ') : input.kind,
    })
    return entry
  } catch (error) {
    // Nothing half-made: files without their row are taken away again.
    await Promise.all(stored.map((s) => deleteStoredFile(s.path)))
    throw error
  }
}

/**
 * Writes a voice note out — on its creation, and again from its "try again".
 * The recording stays whatever happens; the state says how far it got. The
 * text a person already put right is not overwritten by a second attempt.
 */
export async function transcribeDocEntry(entryId: string): Promise<'DONE' | 'FAILED' | 'OFF'> {
  const entry = await db.documentationEntry.findUnique({
    where: { id: entryId },
    select: { kind: true, editedAt: true, files: { select: { path: true }, orderBy: { sortOrder: 'asc' }, take: 1 } },
  })
  if (!entry || entry.kind !== 'VOICE' || entry.files.length === 0) return 'FAILED'
  const model = transcriptionModel()
  if (!model) {
    await db.documentationEntry.update({ where: { id: entryId }, data: { transcription: 'OFF' } })
    return 'OFF'
  }
  await db.documentationEntry.update({ where: { id: entryId }, data: { transcription: 'PENDING' } })
  try {
    const audio = await readStoredFile(entry.files[0].path)
    const text = await transcribeRecording(new Uint8Array(audio), model)
    await db.documentationEntry.update({
      where: { id: entryId },
      data: { transcription: 'DONE', ...(entry.editedAt ? {} : { text: text || null }) },
    })
    return 'DONE'
  } catch (error) {
    // The service's message may quote the request; the name of the failure is enough here.
    console.error('transcription failed', error instanceof Error ? error.name : 'unknown')
    await db.documentationEntry.update({ where: { id: entryId }, data: { transcription: 'FAILED' } })
    return 'FAILED'
  }
}

type Reader = { id: string; role: string }

/** An entry as the section draws it: who and when in words, the files by id, what the reader may do. */
export type DocEntryRow = {
  id: string
  kind: DocKind
  text: string | null
  transcription: 'PENDING' | 'DONE' | 'FAILED' | 'OFF' | null
  author: string | null
  createdAt: Date
  edited: boolean
  files: Array<{ id: string; filename: string; mimeType: string; size: number; durationMs: number | null }>
  canEdit: boolean
  canDelete: boolean
  /** The project folder it lies in; null = the top level. */
  folderId: string | null
}

/**
 * A project's documentation, newest first. Whoever may open the project reads
 * all of it — the site documents for the office and the office for the site;
 * nothing in it carries a price.
 */
export async function docEntriesFor(projectId: string, reader: Reader): Promise<DocEntryRow[]> {
  const rows = await db.documentationEntry.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { username: true, employee: { select: { firstName: true, lastName: true } } } },
      files: { orderBy: { sortOrder: 'asc' }, select: { id: true, filename: true, mimeType: true, size: true, durationMs: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    text: row.text,
    transcription: row.transcription,
    author: row.author ? displayName(row.author) : null,
    createdAt: row.createdAt,
    edited: row.editedAt !== null,
    files: row.files,
    canEdit: canEditDocEntry(reader, row),
    canDelete: canDeleteDocEntry(reader, row),
    folderId: row.folderId,
  }))
}

/** An entry with what the actions need to decide. */
export async function findDocEntry(entryId: string) {
  return db.documentationEntry.findUnique({
    where: { id: entryId },
    select: { id: true, projectId: true, kind: true, authorId: true, text: true, files: { select: { path: true, filename: true } } },
  })
}

/** An entry taken back: the row, then its files. */
export async function deleteDocEntry(entry: NonNullable<Awaited<ReturnType<typeof findDocEntry>>>, userId: string): Promise<void> {
  await db.documentationEntry.delete({ where: { id: entry.id } })
  await Promise.all(entry.files.map((f) => deleteStoredFile(f.path)))
  await audit({
    userId,
    action: 'project.documentation.delete',
    entity: 'Project',
    entityId: entry.projectId,
    oldValue: entry.files.length > 0 ? entry.files.map((f) => f.filename).join(', ') : (entry.text ?? '').slice(0, 200),
  })
}
