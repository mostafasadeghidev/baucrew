import 'server-only'
import { ApiError } from './api-service'
import { readStoredFile } from './file-storage'
import { McpContent } from './mcp'
import {
  addFeedbackNote,
  createFeedback,
  editFeedback,
  feedbackImageFor,
  getFeedbackByNumber,
  listFeedback,
  setFeedbackStatus,
} from './feedback-db'
import {
  canEditFeedback,
  feedbackHandoff,
  LIMITS,
  queryFeedback,
  validateEdit,
  validateNewFeedback,
  validateNote,
  type FeedbackError,
  type FeedbackFilters,
  type FeedbackItemDTO,
  type FeedbackSource,
  type FeedbackStatus,
  type WaitingOn,
} from './feedback'

// The feedback list as a coding agent reaches it over MCP (mcp-catalog.ts →
// "Feedback"): the same items, rules and JSON as "Für Agent kopieren", read and
// written on the live site, so there is one list and nothing to sync. What an
// agent may not do — accept or reject a proposal, mark an item done — it is
// simply not offered.

type Caller = { id: string; role: string }

const MCP_NOTE =
  ' Over MCP: open a picture with get_feedback_image and its id; report back with add_feedback_note and record_feedback_proposal.'

const MESSAGES: Partial<Record<FeedbackError, string>> = {
  stale: 'The item changed in the meantime. Read it again (get_feedback) and retry.',
  notFound: 'No such feedback item, or it is not visible to this user.',
  tooLong: 'A text is too long.',
  commentRequired: 'The comment is empty.',
  noteRequired: 'The note is empty.',
  titleRequired: 'The title is empty.',
}

function refuse(error: FeedbackError): never {
  throw new ApiError(error === 'notFound' ? 404 : error === 'stale' ? 409 : 400, error, MESSAGES[error] ?? error)
}

async function itemOrRefuse(user: Caller, number: number): Promise<FeedbackItemDTO> {
  const item = await getFeedbackByNumber(user, number)
  if (!item) refuse('notFound')
  return item
}

export type ListFeedbackInput = {
  status?: FeedbackFilters['status']
  waitingOn?: FeedbackFilters['waitingOn']
  source?: FeedbackSource
  search?: string
  numbers?: number[]
  limit?: number
}

/** The items as the handoff JSON: the open ones by default, or exactly the numbers asked for. */
export async function listFeedbackForAgent(user: Caller, input: ListFeedbackInput) {
  const all = await listFeedback(user)
  const wanted = input.numbers ?? []
  const items = wanted.length
    ? queryFeedback(
        all.filter((i) => wanted.includes(i.number)),
        { sort: 'number' }
      )
    : queryFeedback(all, {
        status: input.status ?? 'open',
        waitingOn: input.waitingOn ?? 'all',
        source: input.source ?? 'all',
        search: input.search ?? '',
        sort: 'number',
      })
  const handoff = feedbackHandoff(items.slice(0, input.limit ?? 50))
  return { ...handoff, instructions: handoff.instructions + MCP_NOTE, total: items.length }
}

export async function getFeedbackForAgent(user: Caller, number: number) {
  const item = await itemOrRefuse(user, number)
  return feedbackHandoff([item]).items[0]
}

/** A picture as the assistant can look at it. */
export async function feedbackImageForAgent(user: Caller, imageId: string): Promise<McpContent> {
  const image = await feedbackImageFor(user, imageId)
  if (!image) refuse('notFound')
  const data = await readStoredFile(image.path)
  return new McpContent([{ type: 'image', data: data.toString('base64'), mimeType: image.mimeType }])
}

/** Something the agent found that a person should see: a new item from the agent. */
export async function addFeedbackFromAgent(
  user: Caller,
  input: { comment: string; title?: string; page?: string; waitingOn?: WaitingOn }
) {
  const checked = validateNewFeedback({ comment: input.comment, page: input.page ?? '', anchor: null, metadata: null })
  if (!checked.ok) refuse(checked.error)
  const title = input.title?.trim()
  if (title && title.length > LIMITS.title) refuse('tooLong')
  const result = await createFeedback(
    { id: user.id, officeOnly: canEditFeedback(user) },
    { ...checked.value, title: title || checked.value.title },
    [],
    { source: 'agent', waitingOn: input.waitingOn ?? null }
  )
  if ('error' in result) refuse(result.error)
  return { number: result.number, url: `/feedback?item=${result.number}` }
}

export async function addFeedbackNoteFromAgent(user: Caller, input: { number: number; body: string }) {
  const item = await itemOrRefuse(user, input.number)
  const checked = validateNote({ choice: 'note', body: input.body, version: item.version }, item)
  if (!checked.ok) refuse(checked.error)
  const result = await addFeedbackNote(user, item, checked.value)
  if (result.error) refuse(result.error)
  return { number: item.number, noted: true }
}

export type ProposalInput = {
  number: number
  suggestion?: string
  beforeText?: string
  afterText?: string
  completionNote?: string
  decision?: string
  waitingOn?: WaitingOn | null
}

/** The agent's proposal: only the fields sent change, everything else stays as the office left it. */
export async function recordProposalFromAgent(user: Caller, input: ProposalInput) {
  const item = await itemOrRefuse(user, input.number)
  const { number, ...fields } = input
  const checked = validateEdit({
    title: item.title,
    comment: item.comment,
    status: item.status,
    waitingOn: item.waitingOn,
    suggestion: item.suggestion,
    decision: item.decision,
    beforeText: item.beforeText,
    afterText: item.afterText,
    completionNote: item.completionNote,
    version: item.version,
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
  })
  if (!checked.ok) refuse(checked.error)
  const result = await editFeedback(user, item.id, checked.value)
  if (result.error) refuse(result.error)
  return { number, recorded: true, url: `/feedback?item=${number}` }
}

export async function setFeedbackStatusFromAgent(user: Caller, input: { number: number; status: FeedbackStatus }) {
  const item = await itemOrRefuse(user, input.number)
  const result = await setFeedbackStatus(user, item.id, input.status)
  if (result.error) refuse(result.error)
  return { number: item.number, status: input.status }
}
