// Pure rules of the feedback tool — no server-only import, so they can be
// unit-tested and used on both sides. What the tool is: docs/CHANGE-feedback-tool.md.
//
// One feedback item is one request about the app itself: a comment left on a
// page in comment mode (?comment), or an entry of the old progress list. List
// and Kanban show the same items through the same `queryFeedback`; the agent
// reads them through `feedbackHandoff` (the "Copy for agent" JSON) or the
// script scripts/feedback-export.mjs.

export const FEEDBACK_STATUSES = ['INBOX', 'TODO', 'DECISION', 'IN_PROGRESS', 'DONE', 'CLOSED'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

/** Done and closed are the two ends; everything before them is still open. */
export const OPEN_STATUSES: readonly FeedbackStatus[] = ['INBOX', 'TODO', 'DECISION', 'IN_PROGRESS']
export const isOpen = (status: FeedbackStatus) => OPEN_STATUSES.includes(status)

/** Who an item waits on, carried over from the progress list. */
export const WAITING_ON = ['agent', 'owner', 'teammate', 'client'] as const
export type WaitingOn = (typeof WAITING_ON)[number]

export const FEEDBACK_SOURCES = ['comment', 'checklist', 'agent'] as const
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number]

/** A note for the agent, or a decision on the agent's proposal. */
export const NOTE_CHOICES = ['note', 'accept', 'reject'] as const
export type NoteChoice = (typeof NOTE_CHOICES)[number]

/** Pictures of an item: taken in comment mode, added by hand, or the proposal's before and after. */
export const ATTACHMENT_KINDS = ['screenshot', 'upload', 'before', 'after'] as const
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]

export const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']
/** A screenshot is a JPEG of at most 1800 px; this leaves room for an upload. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export const LIMITS = {
  title: 200,
  comment: 4000,
  note: 4000,
  suggestion: 4000,
  decision: 4000,
  completionNote: 4000,
  beforeText: 10000,
  afterText: 10000,
  page: 500,
  selector: 1000,
  selectedText: 700,
  metadata: 8000,
} as const

export type FeedbackAnchor = { selector: string; text: string; x: number; y: number }

export type FeedbackPerson = { id: string; name: string }

export type FeedbackAttachmentDTO = {
  id: string
  kind: AttachmentKind
  filename: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  url: string
}

export type FeedbackEvidence = {
  suggestion: string
  beforeText: string
  afterText: string
  completionNote: string
  beforeImages: string[]
  afterImages: string[]
}

export type FeedbackNoteDTO = {
  id: string
  choice: NoteChoice
  body: string
  itemVersion: number
  evidence: FeedbackEvidence | null
  author: FeedbackPerson | null
  createdAt: string
}

export type FeedbackChangeDTO = {
  id: string
  from: FeedbackStatus | null
  to: FeedbackStatus
  by: FeedbackPerson | null
  createdAt: string
}

/** What the dashboard receives of an item: plain values only. */
export type FeedbackItemDTO = {
  id: string
  number: number
  title: string
  comment: string
  status: FeedbackStatus
  source: FeedbackSource
  waitingOn: WaitingOn | null
  officeOnly: boolean
  page: string
  anchor: FeedbackAnchor | null
  metadata: Record<string, unknown> | null
  context: Record<string, unknown> | null
  suggestion: string
  decision: string
  beforeText: string
  afterText: string
  completionNote: string
  version: number
  author: FeedbackPerson | null
  createdAt: string
  updatedAt: string
  attachments: FeedbackAttachmentDTO[]
  notes: FeedbackNoteDTO[]
  changes: FeedbackChangeDTO[]
}

// ── Who may do what ────────────────────────────────────────────────────

type Viewer = { id: string; role: string }

/**
 * The office (admin, manager) runs the list: status, editing, the proposal,
 * accept and reject, deleting. Everybody else looks and writes notes.
 */
export function canEditFeedback(viewer: { role: string }): boolean {
  return viewer.role === 'ADMIN' || viewer.role === 'MANAGER'
}

/**
 * Whose items a person sees. A screenshot taken by the office may show prices,
 * so an item the office wrote is the office's alone — the crew and the site
 * managers see their own and each other's, never a price.
 */
export function canSeeFeedback(viewer: Viewer, item: { officeOnly: boolean; authorId: string | null }): boolean {
  return canEditFeedback(viewer) || !item.officeOnly || item.authorId === viewer.id
}

/** The same rule as a database filter, so the hidden ones never leave the database. */
export function feedbackVisibleWhere(viewer: Viewer) {
  return canEditFeedback(viewer) ? {} : { OR: [{ officeOnly: false }, { authorId: viewer.id }] }
}

/**
 * The open items pinned on one page that the viewer may see. Both conditions
 * stand side by side under AND: a page filter written next to the visibility
 * filter as a second `OR` would replace it and show the office's items to all.
 */
export function pinsWhere(viewer: Viewer, pathname: string) {
  return {
    AND: [feedbackVisibleWhere(viewer), { OR: [{ page: pathname }, { page: { startsWith: `${pathname}?` } }] }],
    status: { in: [...OPEN_STATUSES] },
  }
}

// ── Evidence ───────────────────────────────────────────────────────────

type EvidenceSource = Pick<FeedbackItemDTO, 'suggestion' | 'beforeText' | 'afterText' | 'completionNote'> & {
  attachments: Pick<FeedbackAttachmentDTO, 'id' | 'kind'>[]
}

const imagesOf = (item: EvidenceSource, kind: AttachmentKind) =>
  item.attachments
    .filter((a) => a.kind === kind)
    .map((a) => a.id)
    .sort()

/** A before/after that actually differs: changed text or an "after" picture. */
export function hasChange(item: EvidenceSource): boolean {
  return item.beforeText !== item.afterText || imagesOf(item, 'after').length > 0
}

/** Whether the agent has recorded anything to decide on. */
export function hasProposal(item: EvidenceSource): boolean {
  return hasChange(item) || item.suggestion.trim() !== ''
}

/** The proposal as it stands, kept with every decision. */
export function evidenceFor(item: EvidenceSource): FeedbackEvidence {
  return {
    suggestion: item.suggestion,
    beforeText: item.beforeText,
    afterText: item.afterText,
    completionNote: item.completionNote,
    beforeImages: imagesOf(item, 'before'),
    afterImages: imagesOf(item, 'after'),
  }
}

/** False once the proposal changed after the decision: an old yes is no yes to the new one. */
export function evidenceMatches(evidence: FeedbackEvidence | null, item: EvidenceSource): boolean {
  if (!evidence) return false
  const now = evidenceFor(item)
  return (
    (['suggestion', 'beforeText', 'afterText', 'completionNote'] as const).every((k) => (evidence[k] ?? '') === now[k]) &&
    (['beforeImages', 'afterImages'] as const).every((k) => [...(evidence[k] ?? [])].sort().join() === now[k].join())
  )
}

/** The newest accept or reject; a later note does not replace it. */
export function latestDecision<T extends Pick<FeedbackNoteDTO, 'choice' | 'createdAt'>>(notes: T[]): T | null {
  return notes.filter((n) => n.choice !== 'note').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

// ── Validation ─────────────────────────────────────────────────────────

export type FeedbackError =
  | 'commentRequired'
  | 'tooLong'
  | 'badStatus'
  | 'badWaitingOn'
  | 'titleRequired'
  | 'stale'
  | 'badChoice'
  | 'noteRequired'
  | 'noProposal'
  | 'badImage'
  | 'imageTooLarge'
  | 'notAllowed'
  | 'notFound'

export type Checked<T> = { ok: true; value: T } | { ok: false; error: FeedbackError }

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** The first line of a comment, as its title: short enough for a card. */
export function titleFrom(comment: string, max = 90): string {
  const line = comment.trim().split(/\r?\n/).find((l) => l.trim() !== '')?.replace(/\s+/g, ' ').trim() ?? ''
  if (line.length <= max) return line
  const cut = line.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`
}

const clamp01 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

export function cleanAnchor(value: unknown): FeedbackAnchor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const a = value as Record<string, unknown>
  const selector = text(a.selector).slice(0, LIMITS.selector)
  const selected = text(a.text).trim().slice(0, LIMITS.selectedText)
  if (!selector && !selected) return null
  return { selector, text: selected, x: clamp01(a.x), y: clamp01(a.y) }
}

/**
 * The browser's facts as they came, but never more than a few kilobytes:
 * something that big is not what the comment mode sends.
 */
export function cleanMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const json = JSON.stringify(value)
  return json.length > LIMITS.metadata ? null : (JSON.parse(json) as Record<string, unknown>)
}

/** The page a comment was left on: a path inside the app, without the comment switch. */
export function cleanPage(value: unknown): string {
  const page = text(value).trim()
  if (!page.startsWith('/') || page.startsWith('//')) return ''
  return withoutCommentParam(page).slice(0, LIMITS.page)
}

export type NewFeedback = {
  title: string
  comment: string
  page: string
  anchor: FeedbackAnchor | null
  metadata: Record<string, unknown> | null
}

export function validateNewFeedback(input: {
  comment: unknown
  page: unknown
  anchor: unknown
  metadata: unknown
}): Checked<NewFeedback> {
  const comment = text(input.comment).trim()
  if (!comment) return { ok: false, error: 'commentRequired' }
  if (comment.length > LIMITS.comment) return { ok: false, error: 'tooLong' }
  return {
    ok: true,
    value: {
      title: titleFrom(comment),
      comment,
      page: cleanPage(input.page),
      anchor: cleanAnchor(input.anchor),
      metadata: cleanMetadata(input.metadata),
    },
  }
}

export type FeedbackEdit = {
  title: string
  comment: string
  status: FeedbackStatus
  waitingOn: WaitingOn | null
  suggestion: string
  decision: string
  beforeText: string
  afterText: string
  completionNote: string
  version: number
}

/** A whole edit of an item by the office, on the version it was read at. */
export function validateEdit(body: Record<string, unknown>): Checked<FeedbackEdit> {
  if (!FEEDBACK_STATUSES.includes(body.status as FeedbackStatus)) return { ok: false, error: 'badStatus' }
  const waitingOn = body.waitingOn === '' || body.waitingOn == null ? null : body.waitingOn
  if (waitingOn !== null && !WAITING_ON.includes(waitingOn as WaitingOn)) return { ok: false, error: 'badWaitingOn' }
  if (!Number.isInteger(body.version) || (body.version as number) < 1) return { ok: false, error: 'stale' }
  const fields = ['title', 'comment', 'suggestion', 'decision', 'beforeText', 'afterText', 'completionNote'] as const
  const value = {} as Record<(typeof fields)[number], string>
  for (const key of fields) {
    const v = text(body[key])
    if (v.length > LIMITS[key]) return { ok: false, error: 'tooLong' }
    // Before and after keep their spaces: a diff of indentation is a diff.
    value[key] = key === 'beforeText' || key === 'afterText' ? v : v.trim()
  }
  if (!value.title) return { ok: false, error: 'titleRequired' }
  return {
    ok: true,
    value: {
      ...value,
      status: body.status as FeedbackStatus,
      waitingOn: waitingOn as WaitingOn | null,
      version: body.version as number,
    },
  }
}

/** A note or a decision, written on the version the person was looking at. */
export function validateNote(
  body: { choice: unknown; body: unknown; version: unknown },
  item: EvidenceSource & { version: number }
): Checked<{ choice: NoteChoice; body: string }> {
  if (!NOTE_CHOICES.includes(body.choice as NoteChoice)) return { ok: false, error: 'badChoice' }
  if (body.version !== item.version) return { ok: false, error: 'stale' }
  const note = text(body.body).trim()
  if (note.length > LIMITS.note) return { ok: false, error: 'tooLong' }
  const choice = body.choice as NoteChoice
  if (choice === 'note' && !note) return { ok: false, error: 'noteRequired' }
  if (choice !== 'note' && !hasProposal(item)) return { ok: false, error: 'noProposal' }
  return { ok: true, value: { choice, body: note } }
}

export function validateImage(file: { size: number; type: string }): FeedbackError | null {
  if (!IMAGE_TYPES.includes(file.type) || file.size <= 0) return 'badImage'
  if (file.size > MAX_IMAGE_BYTES) return 'imageTooLarge'
  return null
}

// ── The comment switch on the address ──────────────────────────────────

/** The query word that turns comment mode on. */
export const COMMENT_PARAM = 'comment'
/** The element an "open the page" link should show (a CSS selector). */
export const TARGET_PARAM = 'feedbackTarget'

function splitPath(path: string) {
  const hashAt = path.indexOf('#')
  const beforeHash = hashAt === -1 ? path : path.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : path.slice(hashAt)
  const queryAt = beforeHash.indexOf('?')
  return {
    pathname: queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt),
    params: new URLSearchParams(queryAt === -1 ? '' : beforeHash.slice(queryAt + 1)),
    hash,
  }
}

/** `/projects?x=1` → `/projects?x=1&comment`, the word bare like the reference tool writes it. */
export function withCommentParam(path: string): string {
  const { pathname, params, hash } = splitPath(path)
  if (params.has(COMMENT_PARAM)) return path
  const rest = params.toString()
  return `${pathname}?${rest ? `${rest}&` : ''}${COMMENT_PARAM}${hash}`
}

export function withoutCommentParam(path: string): string {
  const { pathname, params, hash } = splitPath(path)
  params.delete(COMMENT_PARAM)
  params.delete(TARGET_PARAM)
  const rest = params.toString()
  return `${pathname}${rest ? `?${rest}` : ''}${hash}`
}

/** The link that opens an item's page in comment mode, its element outlined. */
export function pageLink(item: Pick<FeedbackItemDTO, 'page' | 'anchor'>): string | null {
  if (!item.page) return null
  const base = withCommentParam(item.page)
  return item.anchor?.selector ? `${base}&${TARGET_PARAM}=${encodeURIComponent(item.anchor.selector)}` : base
}

// ── One query for every view ───────────────────────────────────────────

export type FeedbackSort = 'newest' | 'oldest' | 'updated' | 'number' | 'status' | 'title'
export const FEEDBACK_SORTS: readonly FeedbackSort[] = ['newest', 'oldest', 'updated', 'number', 'status', 'title']

export type FeedbackFilters = {
  search: string
  /** all | open | one status */
  status: 'all' | 'open' | FeedbackStatus
  /** all | none | one person */
  waitingOn: 'all' | 'none' | WaitingOn
  source: 'all' | FeedbackSource
  /** all | with | without — an agent proposal recorded */
  proposal: 'all' | 'with' | 'without'
  sort: FeedbackSort
}

export const DEFAULT_FILTERS: FeedbackFilters = {
  search: '',
  status: 'all',
  waitingOn: 'all',
  source: 'all',
  proposal: 'all',
  sort: 'newest',
}

/** How many filters differ from the default — the number on the filter button. */
export function activeFilterCount(filters: FeedbackFilters): number {
  return (['status', 'waitingOn', 'source', 'proposal'] as const).filter((k) => filters[k] !== DEFAULT_FILTERS[k]).length
}

/** Filters read back from storage: anything unknown falls back to the default. */
export function cleanFilters(value: unknown): FeedbackFilters {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const pick = <T extends string>(x: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(x as T) ? (x as T) : fallback
  return {
    search: typeof v.search === 'string' ? v.search.slice(0, 200) : '',
    status: pick(v.status, ['all', 'open', ...FEEDBACK_STATUSES] as const, 'all'),
    waitingOn: pick(v.waitingOn, ['all', 'none', ...WAITING_ON] as const, 'all'),
    source: pick(v.source, ['all', ...FEEDBACK_SOURCES] as const, 'all'),
    proposal: pick(v.proposal, ['all', 'with', 'without'] as const, 'all'),
    sort: pick(v.sort, FEEDBACK_SORTS, 'newest'),
  }
}

type Queryable = Pick<
  FeedbackItemDTO,
  | 'id'
  | 'number'
  | 'title'
  | 'comment'
  | 'status'
  | 'source'
  | 'waitingOn'
  | 'page'
  | 'suggestion'
  | 'decision'
  | 'createdAt'
  | 'updatedAt'
> &
  EvidenceSource & { author: FeedbackPerson | null; notes?: Pick<FeedbackNoteDTO, 'body'>[] }

/** Every view shows exactly this; Kanban only groups it by status. */
export function queryFeedback<T extends Queryable>(items: T[], filters: Partial<FeedbackFilters> = {}): T[] {
  const f = { ...DEFAULT_FILTERS, ...filters }
  const words = f.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const newest = (a: T, b: T) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number
  const comparators: Record<FeedbackSort, (a: T, b: T) => number> = {
    newest,
    oldest: (a, b) => -newest(a, b),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || newest(a, b),
    number: (a, b) => a.number - b.number,
    status: (a, b) => FEEDBACK_STATUSES.indexOf(a.status) - FEEDBACK_STATUSES.indexOf(b.status) || newest(a, b),
    title: (a, b) => a.title.localeCompare(b.title, 'de') || newest(a, b),
  }
  return items
    .filter((item) => {
      if (f.status === 'open' ? !isOpen(item.status) : f.status !== 'all' && item.status !== f.status) return false
      if (f.waitingOn === 'none' ? item.waitingOn !== null : f.waitingOn !== 'all' && item.waitingOn !== f.waitingOn)
        return false
      if (f.source !== 'all' && item.source !== f.source) return false
      if (f.proposal !== 'all' && hasProposal(item) !== (f.proposal === 'with')) return false
      if (!words.length) return true
      const haystack = [
        `#${item.number}`,
        item.title,
        item.comment,
        item.author?.name ?? '',
        item.page,
        item.suggestion,
        item.decision,
        ...(item.notes ?? []).map((n) => n.body),
      ]
        .join(' ')
        .toLocaleLowerCase()
      return words.every((w) => haystack.includes(w))
    })
    .sort(comparators[f.sort] ?? newest)
}

/** The shown items by status, every status present even when empty. */
export function groupByStatus<T extends { status: FeedbackStatus }>(items: T[]): Record<FeedbackStatus, T[]> {
  const groups = Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s, [] as T[]])) as Record<FeedbackStatus, T[]>
  for (const item of items) groups[item.status].push(item)
  return groups
}

/** Ticking an item off: done; unticking it: back to the list of things to do. */
export function toggledStatus(status: FeedbackStatus): FeedbackStatus {
  return status === 'DONE' || status === 'CLOSED' ? 'TODO' : 'DONE'
}

// ── Before / after ─────────────────────────────────────────────────────

export type DiffPart = { type: 'same' | 'add' | 'del'; text: string }

/**
 * Word diff of the before and after text, spaces kept as their own tokens so
 * the two sides read back exactly. Longest common subsequence; a text too long
 * for that is shown as one removal and one addition.
 */
export function wordDiff(before: string, after: string, maxTokens = 1500): DiffPart[] {
  const a = before.split(/(\s+)/).filter((t) => t !== '')
  const b = after.split(/(\s+)/).filter((t) => t !== '')
  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], value: string) => {
    const last = parts[parts.length - 1]
    if (last && last.type === type) last.text += value
    else parts.push({ type, text: value })
  }
  if (a.length > maxTokens || b.length > maxTokens) {
    if (before) push('del', before)
    if (after) push('add', after)
    return parts
  }
  // lengths[i][j] = the longest common run of a[i..] and b[j..]
  const lengths: Uint16Array[] = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) push('del', a[i++])
    else push('add', b[j++])
  }
  while (i < a.length) push('del', a[i++])
  while (j < b.length) push('add', b[j++])
  return parts
}

// ── The handoff to a coding agent ──────────────────────────────────────

export const HANDOFF_INSTRUCTIONS =
  'BauCrew feedback for a coding agent. Each item is a request about the app: the comment, the page it was left on (pageLink opens it with the comment toolbar and the element outlined), the element picked, the device, and screenshots. "notes" are notes for the agent and decisions on its proposal, newest first. Act on an accept only while evidenceMatchesCurrent is true; a rejected or changed proposal needs a fresh review. Notes on an item without a proposal are context, not approval. Status DECISION waits on a person: do not build it before the question in decisionNeeded is answered. Image URLs need a logged-in session; scripts/feedback-export.mjs prints the same items with the files\' paths under storage/.'

/** The JSON "Copy for agent" writes: the shown items with everything an agent needs. */
export function feedbackHandoff(items: FeedbackItemDTO[], options: { origin?: string; exportedAt?: string } = {}) {
  const origin = options.origin ?? ''
  return {
    schemaVersion: 1,
    project: 'BauCrew',
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    instructions: HANDOFF_INSTRUCTIONS,
    items: items.map((item) => {
      const link = pageLink(item)
      return {
        number: item.number,
        id: item.id,
        title: item.title,
        comment: item.comment,
        status: item.status,
        waitingOn: item.waitingOn,
        source: item.source,
        author: item.author?.name ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        version: item.version,
        page: item.page || null,
        pageLink: link ? `${origin}${link}` : null,
        anchor: item.anchor,
        device: item.metadata,
        context: item.context,
        decisionNeeded: item.decision || null,
        proposal: hasProposal(item) ? { ...evidenceFor(item), hasChange: hasChange(item) } : null,
        images: item.attachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          filename: a.filename,
          width: a.width,
          height: a.height,
          url: `${origin}${a.url}`,
        })),
        notes: [...item.notes]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((n) => ({
            choice: n.choice,
            body: n.body,
            author: n.author?.name ?? null,
            createdAt: n.createdAt,
            itemVersion: n.itemVersion,
            ...(n.choice === 'note' ? {} : { evidenceMatchesCurrent: evidenceMatches(n.evidence, item) }),
          })),
        statusHistory: item.changes.map((c) => ({ from: c.from, to: c.to, by: c.by?.name ?? null, at: c.createdAt })),
      }
    }),
  }
}

/**
 * The picture type its first bytes say, whatever the browser claimed: a file
 * that is not one of the three is not stored.
 */
export function sniffImageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const at = (i: number) => bytes[i]
  if (bytes.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png'
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}
