import 'server-only'
import { randomUUID } from 'crypto'
import { db } from './db'
import { deleteStoredFile, saveStoredFile } from './file-storage'
import { safeFileName } from './files'
import { displayName } from './comments-db'
import type { Prisma } from '@/generated/prisma/client'
import {
  canSeeFeedback,
  evidenceFor,
  feedbackVisibleWhere,
  pinsWhere,
  sniffImageType,
  validateImage,
  type AttachmentKind,
  type FeedbackEdit,
  type FeedbackError,
  type FeedbackEvidence,
  type FeedbackItemDTO,
  type FeedbackSource,
  type FeedbackStatus,
  type NewFeedback,
  type NoteChoice,
  type WaitingOn,
} from './feedback'

// The feedback tool's database side: what the dashboard lists, what comment
// mode writes, what the office changes. Who may call what is decided in
// src/app/feedback-actions.ts; the rules themselves are in ./feedback.ts.

type Viewer = { id: string; role: string }

const person = { select: { id: true, username: true, employee: { select: { firstName: true, lastName: true } } } } as const

const include = {
  author: person,
  attachments: { orderBy: { createdAt: 'asc' } },
  notes: { orderBy: { createdAt: 'desc' }, include: { author: person } },
  changes: { orderBy: { createdAt: 'asc' }, include: { changedBy: person } },
} satisfies Prisma.FeedbackItemInclude

type Row = Prisma.FeedbackItemGetPayload<{ include: typeof include }>
type PersonRow = { id: string; username: string; employee: { firstName: string; lastName: string } | null } | null

const toPerson = (u: PersonRow) => (u ? { id: u.id, name: displayName(u) } : null)
const asObject = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

export const attachmentUrl = (id: string) => `/api/feedback/attachments/${id}`

function toDTO(row: Row): FeedbackItemDTO {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    comment: row.comment,
    status: row.status,
    source: row.source as FeedbackSource,
    waitingOn: (row.waitingOn as WaitingOn | null) ?? null,
    officeOnly: row.officeOnly,
    page: row.page,
    anchor: asObject(row.anchor) as FeedbackItemDTO['anchor'],
    metadata: asObject(row.metadata),
    context: asObject(row.context),
    suggestion: row.suggestion,
    decision: row.decision,
    beforeText: row.beforeText,
    afterText: row.afterText,
    completionNote: row.completionNote,
    version: row.version,
    author: toPerson(row.author),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    attachments: row.attachments.map((a) => ({
      id: a.id,
      kind: a.kind as AttachmentKind,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      width: a.width,
      height: a.height,
      url: attachmentUrl(a.id),
    })),
    notes: row.notes.map((n) => ({
      id: n.id,
      choice: n.choice as NoteChoice,
      body: n.body,
      itemVersion: n.itemVersion,
      evidence: asObject(n.evidence) as FeedbackEvidence | null,
      author: toPerson(n.author),
      createdAt: n.createdAt.toISOString(),
    })),
    changes: row.changes.map((c) => ({
      id: c.id,
      from: c.fromStatus,
      to: c.toStatus,
      by: toPerson(c.changedBy),
      createdAt: c.createdAt.toISOString(),
    })),
  }
}

/** Every item the viewer may see, newest first, with everything hanging on it. */
export async function listFeedback(viewer: Viewer): Promise<FeedbackItemDTO[]> {
  const rows = await db.feedbackItem.findMany({
    where: feedbackVisibleWhere(viewer),
    include,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toDTO)
}

export async function getFeedback(viewer: Viewer, id: string): Promise<FeedbackItemDTO | null> {
  const row = await db.feedbackItem.findFirst({ where: { id, ...feedbackVisibleWhere(viewer) }, include })
  return row ? toDTO(row) : null
}

/** One item by its number ("#64"), when the viewer may see it. */
export async function getFeedbackByNumber(viewer: Viewer, number: number): Promise<FeedbackItemDTO | null> {
  const row = await db.feedbackItem.findFirst({ where: { number, ...feedbackVisibleWhere(viewer) }, include })
  return row ? toDTO(row) : null
}

/** One picture's file and type, when the viewer may see its item. */
export async function feedbackImageFor(viewer: Viewer, attachmentId: string) {
  const row = await db.feedbackAttachment.findUnique({
    where: { id: attachmentId },
    select: { path: true, mimeType: true, item: { select: { officeOnly: true, authorId: true } } },
  })
  if (!row || !canSeeFeedback(viewer, row.item)) return null
  return { path: row.path, mimeType: row.mimeType }
}

/** The open items on one page the viewer may see — the numbered pins in comment mode. */
export async function pinsFor(viewer: Viewer, pathname: string) {
  const rows = await db.feedbackItem.findMany({
    where: pinsWhere(viewer, pathname),
    select: { id: true, number: true, title: true, status: true, anchor: true },
    orderBy: { number: 'asc' },
    take: 100,
  })
  return rows.map((r) => ({ ...r, anchor: asObject(r.anchor) as FeedbackItemDTO['anchor'] }))
}

export type IncomingImage = { kind: AttachmentKind; file: File; width: number | null; height: number | null }

const dimension = (n: number | null) => (n != null && Number.isInteger(n) && n > 0 && n < 20000 ? n : null)

/** Checks one picture and writes it to storage; the row is the caller's to create. */
async function storeImage(itemId: string, image: IncomingImage) {
  const invalid = validateImage(image.file)
  if (invalid) return { error: invalid }
  const data = Buffer.from(await image.file.arrayBuffer())
  const type = sniffImageType(data)
  if (!type) return { error: 'badImage' as const }
  const id = randomUUID()
  const filename = safeFileName(image.file.name || 'bild')
  const path = `feedback/${itemId}/${id}-${filename}`
  await saveStoredFile(path, data)
  return {
    row: { kind: image.kind, filename, mimeType: type, size: data.length, path, width: dimension(image.width), height: dimension(image.height) },
  }
}

/**
 * A comment from comment mode, with its screenshots. The office's comments are
 * the office's alone (their pictures may show prices).
 */
export async function createFeedback(
  author: { id: string; officeOnly: boolean },
  input: NewFeedback,
  images: IncomingImage[],
  extra: { source?: FeedbackSource; waitingOn?: WaitingOn | null } = {}
): Promise<{ id: string; number: number } | { error: FeedbackError }> {
  const id = randomUUID()
  const stored = []
  for (const image of images) {
    const result = await storeImage(id, image)
    if ('error' in result) {
      await Promise.all(stored.map((s) => deleteStoredFile(s.path)))
      return { error: result.error ?? 'badImage' }
    }
    stored.push(result.row)
  }
  try {
    const item = await db.feedbackItem.create({
      data: {
        id,
        title: input.title,
        comment: input.comment,
        page: input.page,
        anchor: (input.anchor ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        officeOnly: author.officeOnly,
        source: extra.source ?? 'comment',
        waitingOn: extra.waitingOn ?? null,
        authorId: author.id,
        changes: { create: { toStatus: 'INBOX', changedById: author.id } },
        attachments: { create: stored.map((s) => ({ ...s, uploadedById: author.id })) },
      },
      select: { id: true, number: true },
    })
    return item
  } catch (error) {
    await Promise.all(stored.map((s) => deleteStoredFile(s.path)))
    throw error
  }
}

/**
 * Raises the version only when it is still the one the change was made on, so
 * two tabs never overwrite each other silently. Null when it was not.
 */
async function bump(tx: Prisma.TransactionClient, id: string, version: number | null, data: Prisma.FeedbackItemUpdateManyMutationInput) {
  const { count } = await tx.feedbackItem.updateMany({
    where: { id, ...(version == null ? {} : { version }) },
    data: { ...data, version: { increment: 1 } },
  })
  return count === 1
}

export async function editFeedback(user: Viewer, id: string, edit: FeedbackEdit): Promise<{ error?: FeedbackError }> {
  const current = await db.feedbackItem.findUnique({ where: { id }, select: { status: true } })
  if (!current) return { error: 'notFound' }
  return db.$transaction(async (tx) => {
    const { version, ...fields } = edit
    if (!(await bump(tx, id, version, fields))) return { error: 'stale' as const }
    if (current.status !== edit.status)
      await tx.feedbackStatusChange.create({ data: { itemId: id, fromStatus: current.status, toStatus: edit.status, changedById: user.id } })
    return {}
  })
}

/**
 * A status set on its own — the tick, a card dragged to another column. No
 * version needed: the last one to move it wins, and the history keeps both.
 */
export async function setFeedbackStatus(user: Viewer, id: string, status: FeedbackStatus): Promise<{ error?: FeedbackError }> {
  const current = await db.feedbackItem.findUnique({ where: { id }, select: { status: true } })
  if (!current) return { error: 'notFound' }
  if (current.status === status) return {}
  await db.$transaction(async (tx) => {
    await bump(tx, id, null, { status })
    await tx.feedbackStatusChange.create({ data: { itemId: id, fromStatus: current.status, toStatus: status, changedById: user.id } })
  })
  return {}
}

/**
 * A note, or a decision on the proposal, kept with the proposal as it stood.
 * Raises the version too: whoever looks at the old one sees there is news.
 */
export async function addFeedbackNote(
  user: Viewer,
  item: FeedbackItemDTO,
  note: { choice: NoteChoice; body: string }
): Promise<{ error?: FeedbackError }> {
  return db.$transaction(async (tx) => {
    if (!(await bump(tx, item.id, item.version, {}))) return { error: 'stale' as const }
    await tx.feedbackNote.create({
      data: {
        itemId: item.id,
        choice: note.choice,
        body: note.body,
        itemVersion: item.version,
        evidence: note.choice === 'note' ? undefined : (evidenceFor(item) as unknown as Prisma.InputJsonValue),
        authorId: user.id,
      },
    })
    return {}
  })
}

/** A picture added to an item afterwards: another screenshot, or the proposal's before or after. */
export async function addFeedbackImage(user: Viewer, itemId: string, image: IncomingImage): Promise<{ error?: FeedbackError }> {
  const exists = await db.feedbackItem.findUnique({ where: { id: itemId }, select: { id: true } })
  if (!exists) return { error: 'notFound' }
  const result = await storeImage(itemId, image)
  if ('error' in result) return { error: result.error ?? 'badImage' }
  await db.$transaction(async (tx) => {
    await tx.feedbackAttachment.create({ data: { ...result.row, itemId, uploadedById: user.id } })
    await bump(tx, itemId, null, {})
  })
  return {}
}

export async function removeFeedbackImage(attachmentId: string): Promise<{ error?: FeedbackError }> {
  const attachment = await db.feedbackAttachment.findUnique({ where: { id: attachmentId } })
  if (!attachment) return { error: 'notFound' }
  await db.$transaction(async (tx) => {
    await tx.feedbackAttachment.delete({ where: { id: attachmentId } })
    await bump(tx, attachment.itemId, null, {})
  })
  await deleteStoredFile(attachment.path)
  return {}
}

export async function deleteFeedback(id: string): Promise<{ error?: FeedbackError }> {
  const attachments = await db.feedbackAttachment.findMany({ where: { itemId: id }, select: { path: true } })
  const { count } = await db.feedbackItem.deleteMany({ where: { id } })
  if (!count) return { error: 'notFound' }
  await Promise.all(attachments.map((a) => deleteStoredFile(a.path)))
  return {}
}
