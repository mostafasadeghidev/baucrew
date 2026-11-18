'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/authz'
import {
  ATTACHMENT_KINDS,
  FEEDBACK_STATUSES,
  canEditFeedback,
  validateEdit,
  validateNewFeedback,
  validateNote,
  type AttachmentKind,
  type FeedbackError,
  type FeedbackStatus,
} from '@/lib/feedback'
import {
  addFeedbackImage,
  addFeedbackNote,
  createFeedback,
  deleteFeedback,
  editFeedback,
  getFeedback,
  removeFeedbackImage,
  setFeedbackStatus,
  type IncomingImage,
} from '@/lib/feedback-db'

/**
 * The feedback tool's writes. Anybody logged in leaves comments and notes;
 * the office (admin, manager) moves, edits, decides on proposals and deletes.
 * Every check is made here on the server — the dashboard only hides what a
 * person cannot do.
 */

export type FeedbackResult = { error?: FeedbackError; number?: number }

function refresh() {
  revalidatePath('/feedback')
  revalidatePath('/my/feedback')
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

function parseJson(v: FormDataEntryValue | null): unknown {
  if (typeof v !== 'string' || !v) return null
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

/** A comment from comment mode: the text, where it was left, the browser's facts, up to two pictures. */
export async function submitFeedback(formData: FormData): Promise<FeedbackResult> {
  const user = await requireUser()
  const checked = validateNewFeedback({
    comment: formData.get('comment'),
    page: formData.get('page'),
    anchor: parseJson(formData.get('anchor')),
    metadata: parseJson(formData.get('metadata')),
  })
  if (!checked.ok) return { error: checked.error }
  const images: IncomingImage[] = []
  for (const [field, kind] of [
    ['screenshot', 'screenshot'],
    ['upload', 'upload'],
  ] as const) {
    const file = formData.get(field)
    if (file instanceof File && file.size > 0)
      images.push({ kind, file, width: num(formData.get(`${field}Width`)), height: num(formData.get(`${field}Height`)) })
  }
  const result = await createFeedback({ id: user.id, officeOnly: canEditFeedback(user) }, checked.value, images)
  if ('error' in result) return { error: result.error }
  refresh()
  return { number: result.number }
}

/** The office's edit of an item: text, status, who it waits on, the agent's proposal. */
export async function updateFeedback(id: string, body: Record<string, unknown>): Promise<FeedbackResult> {
  const user = await requireUser()
  if (!canEditFeedback(user)) return { error: 'notAllowed' }
  const checked = validateEdit(body)
  if (!checked.ok) return { error: checked.error }
  const result = await editFeedback(user, id, checked.value)
  if (!result.error) refresh()
  return result
}

/** The tick in the list, a card dragged to another column. */
export async function moveFeedback(id: string, status: FeedbackStatus): Promise<FeedbackResult> {
  const user = await requireUser()
  if (!canEditFeedback(user)) return { error: 'notAllowed' }
  if (!FEEDBACK_STATUSES.includes(status)) return { error: 'badStatus' }
  const result = await setFeedbackStatus(user, id, status)
  if (!result.error) refresh()
  return result
}

/** A note for the agent — anybody who sees the item. Accept and reject — the office. */
export async function noteFeedback(id: string, body: { choice: unknown; body: unknown; version: unknown }): Promise<FeedbackResult> {
  const user = await requireUser()
  const item = await getFeedback(user, id)
  if (!item) return { error: 'notFound' }
  if (body.choice !== 'note' && !canEditFeedback(user)) return { error: 'notAllowed' }
  const checked = validateNote(body, item)
  if (!checked.ok) return { error: checked.error }
  const result = await addFeedbackNote(user, item, checked.value)
  if (!result.error) refresh()
  return result
}

/** A picture for the proposal (before / after) or another screenshot, by the office. */
export async function uploadFeedbackImage(id: string, formData: FormData): Promise<FeedbackResult> {
  const user = await requireUser()
  if (!canEditFeedback(user)) return { error: 'notAllowed' }
  const kind = formData.get('kind') as AttachmentKind
  const file = formData.get('file')
  if (!ATTACHMENT_KINDS.includes(kind) || !(file instanceof File)) return { error: 'badImage' }
  const result = await addFeedbackImage(user, id, { kind, file, width: num(formData.get('width')), height: num(formData.get('height')) })
  if (!result.error) refresh()
  return result
}

export async function deleteFeedbackImage(attachmentId: string): Promise<FeedbackResult> {
  const user = await requireUser()
  if (!canEditFeedback(user)) return { error: 'notAllowed' }
  const result = await removeFeedbackImage(attachmentId)
  if (!result.error) refresh()
  return result
}

export async function removeFeedback(id: string): Promise<FeedbackResult> {
  const user = await requireUser()
  if (!canEditFeedback(user)) return { error: 'notAllowed' }
  const result = await deleteFeedback(id)
  if (!result.error) refresh()
  return result
}

