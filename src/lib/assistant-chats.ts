import 'server-only'
import type { UIMessage } from 'ai'
import { db } from './db'
import type { Prisma } from '@/generated/prisma/client'
import { chatTitle, isChatId, type ChatSummary } from './assistant-history'

// Where the assistant's conversations are kept: one row each, the person's
// own. Every read and write names the user, so a conversation is never listed,
// opened, continued, put away or deleted by anybody else — a foreign id reads
// as one that does not exist.

/** How many conversations the history lists at most, per side. */
const LIST_LIMIT = 100

const summary = (row: { id: string; title: string; updatedAt: Date; archivedAt: Date | null }): ChatSummary => ({
  id: row.id,
  title: row.title,
  updatedAt: row.updatedAt.toISOString(),
  archived: row.archivedAt !== null,
})

const select = { id: true, title: true, updatedAt: true, archivedAt: true } as const

export async function listChats(userId: string, archived: boolean): Promise<ChatSummary[]> {
  const rows = await db.assistantChat.findMany({
    where: { userId, archivedAt: archived ? { not: null } : null },
    orderBy: { updatedAt: 'desc' },
    take: LIST_LIMIT,
    select,
  })
  return rows.map(summary)
}

export async function loadChat(userId: string, id: string): Promise<(ChatSummary & { messages: UIMessage[] }) | null> {
  if (!isChatId(id)) return null
  const row = await db.assistantChat.findFirst({ where: { id, userId }, select: { ...select, messages: true } })
  return row ? { ...summary(row), messages: Array.isArray(row.messages) ? (row.messages as unknown as UIMessage[]) : [] } : null
}

/** The conversation the panel opens on: the latest one not put away. */
export async function latestChat(userId: string) {
  const row = await db.assistantChat.findFirst({ where: { userId, archivedAt: null }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
  return row ? loadChat(userId, row.id) : null
}

/** Whether the id is free or this person's own — a conversation of somebody else's is never written. */
export async function mayWriteChat(userId: string, id: string): Promise<boolean> {
  if (!isChatId(id)) return false
  const row = await db.assistantChat.findUnique({ where: { id }, select: { userId: true } })
  return !row || row.userId === userId
}

/** Keeps the conversation as it stands; talking on in a put-away one brings it back. */
export async function saveChat(userId: string, id: string, messages: UIMessage[]): Promise<void> {
  if (!(await mayWriteChat(userId, id)) || messages.length === 0) return
  const json = messages as unknown as Prisma.InputJsonValue
  await db.assistantChat.upsert({
    where: { id },
    create: { id, userId, title: chatTitle(messages) || '…', messages: json },
    update: { messages: json, archivedAt: null, updatedAt: new Date() },
  })
}

export async function setChatArchived(userId: string, id: string, archived: boolean): Promise<boolean> {
  if (!isChatId(id)) return false
  const { count } = await db.assistantChat.updateMany({ where: { id, userId }, data: { archivedAt: archived ? new Date() : null } })
  return count > 0
}

export async function deleteChat(userId: string, id: string): Promise<boolean> {
  if (!isChatId(id)) return false
  const { count } = await db.assistantChat.deleteMany({ where: { id, userId } })
  return count > 0
}
