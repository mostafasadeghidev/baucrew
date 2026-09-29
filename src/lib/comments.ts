/**
 * Comments on a project — the team talking on the card, the way it does
 * under a Trello card. Who is named with @, and how a body is drawn with
 * its names lit. Pure, so the rules are tested without a database.
 */

export const COMMENT_MAX = 4000

/**
 * The mark an office-only comment leaves on its history rows (written,
 * changed, taken back): the site manager's view of the card's history leaves
 * those rows out, as it leaves out the comment.
 */
export const OFFICE_COMMENT = 'office'

/** What writing or taking back a comment can come to. */
export type CommentResult = { error?: 'empty' | 'notAllowed' | 'saveFailed' }

/** Somebody who can be named: the account's name, and how they are called. */
export type Mentionable = { id: string; username: string; name: string }

/** An @-name in a body: letters, digits, dot, dash and underscore, the way account names are made. */
const MENTION = /(^|[^\w@])@([\p{L}\p{N}._-]+)/gu

/** The account names written with @ in a body, once each, in order. */
export function mentionTokens(body: string): string[] {
  const seen = new Set<string>()
  for (const match of body.matchAll(MENTION)) {
    const name = match[2].replace(/[.-]+$/, '')
    if (name) seen.add(name.toLowerCase())
  }
  return [...seen]
}

/** The users a body names, by account name, case-insensitively. */
export function mentionedUsers(body: string, people: Mentionable[]): Mentionable[] {
  const tokens = new Set(mentionTokens(body))
  return people.filter((p) => tokens.has(p.username.toLowerCase()))
}

export type CommentSegment = { text: string; mention: Mentionable | null }

/** A body cut into plain text and the names it lights up, for drawing. */
export function commentSegments(body: string, people: Mentionable[]): CommentSegment[] {
  const byName = new Map(people.map((p) => [p.username.toLowerCase(), p]))
  const segments: CommentSegment[] = []
  let at = 0
  for (const match of body.matchAll(MENTION)) {
    const lead = match[1]
    const raw = match[2]
    const trimmed = raw.replace(/[.-]+$/, '')
    const person = byName.get(trimmed.toLowerCase())
    if (!person) continue
    const start = match.index! + lead.length
    if (start > at) segments.push({ text: body.slice(at, start), mention: null })
    segments.push({ text: `@${trimmed}`, mention: person })
    at = start + 1 + trimmed.length
  }
  if (at < body.length) segments.push({ text: body.slice(at), mention: null })
  return segments
}

/**
 * What the picker offers while somebody types an @-name: the word being
 * typed at the caret, if it starts with @, and the people whose account or
 * name begins with it.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const match = /(^|[^\w@])@([\p{L}\p{N}._-]*)$/u.exec(before)
  if (!match) return null
  return { start: before.length - match[2].length - 1, query: match[2] }
}

export function mentionMatches(query: string, people: Mentionable[], limit = 6): Mentionable[] {
  const q = query.toLowerCase()
  return people
    .filter((p) => p.username.toLowerCase().startsWith(q) || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
    .slice(0, limit)
}

/** Only the author puts a comment right — an administrator takes one back, but does not rewrite it. */
export function canEditComment(user: { id: string }, comment: { authorId: string | null }): boolean {
  return comment.authorId !== null && comment.authorId === user.id
}

/** The signs a comment can be answered with, the ones a Trello comment offers first. */
export const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🙏'] as const
export type Reaction = (typeof REACTIONS)[number]

export function isReaction(value: unknown): value is Reaction {
  return typeof value === 'string' && (REACTIONS as readonly string[]).includes(value)
}

/**
 * The signs under one comment, in the order they are offered: how many gave
 * each, whether the reader is one of them, and who they are for the tooltip.
 */
export function reactionSummary(
  rows: Array<{ emoji: string; userId: string; name: string }>,
  readerId: string
): Array<{ emoji: string; count: number; mine: boolean; names: string[] }> {
  return REACTIONS.flatMap((emoji) => {
    const given = rows.filter((r) => r.emoji === emoji)
    return given.length > 0 ? [{ emoji, count: given.length, mine: given.some((r) => r.userId === readerId), names: given.map((r) => r.name) }] : []
  })
}

/** Whoever wrote a comment may take it back; an administrator may take any back. */
export function canDeleteComment(user: { id: string; role: string }, comment: { authorId: string | null }): boolean {
  return user.role === 'ADMIN' || (comment.authorId !== null && comment.authorId === user.id)
}
