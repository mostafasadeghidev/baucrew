import type { UIMessage } from 'ai'

// The assistant's conversations as the history lists them: an id the panel
// makes, a title taken from the first question, and the day groups the list
// is cut into. Pure, so the panel and the tests use it as it is.

export type ChatSummary = { id: string; title: string; updatedAt: string; archived: boolean }

/** An id the panel made — opaque, short, nothing that could mean anything else. */
export const isChatId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v)

const TITLE_LENGTH = 80

/** The conversation's name: its first question, on one line and shortened. */
export function chatTitle(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  const text = (first?.parts ?? [])
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= TITLE_LENGTH) return text
  const cut = text.slice(0, TITLE_LENGTH)
  const space = cut.lastIndexOf(' ')
  return `${(space > TITLE_LENGTH / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`
}

export type ChatGroup = 'today' | 'yesterday' | 'week' | 'older'

/** Which part of the history a conversation stands in, by its last change in the person's own day. */
export function chatGroup(updatedAt: Date, now: Date): ChatGroup {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(updatedAt)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return 'week'
  return 'older'
}

/** The conversations cut into their groups, newest first, empty groups left out. */
export function groupChats<T extends { updatedAt: string }>(chats: T[], now: Date): Array<{ group: ChatGroup; chats: T[] }> {
  const order: ChatGroup[] = ['today', 'yesterday', 'week', 'older']
  const sorted = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return order
    .map((group) => ({ group, chats: sorted.filter((c) => chatGroup(new Date(c.updatedAt), now) === group) }))
    .filter((g) => g.chats.length > 0)
}
