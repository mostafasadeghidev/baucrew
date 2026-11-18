// DB-backed: runs against the database in DATABASE_URL (npm run test:db) —
// a throwaway one, never real data. The assistant's conversations are the
// person's own: kept and continued by them, never listed, opened, written,
// put away or deleted by somebody else.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { deleteChat, latestChat, listChats, loadChat, mayWriteChat, saveChat, setChatArchived } from '@/lib/assistant-chats'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-chat-${Date.now()}`
const owner = { id: '' }
const other = { id: '' }
const chatId = `${TAG}-one`.replace(/[^\w-]/g, '')
const said = (text: string): UIMessage => ({ id: `m-${text.length}`, role: 'user', parts: [{ type: 'text', text }] })

beforeAll(async () => {
  owner.id = (await prisma.user.create({ data: { username: `${TAG}-owner`, passwordHash: 'x', role: 'MANAGER' } })).id
  other.id = (await prisma.user.create({ data: { username: `${TAG}-other`, passwordHash: 'x', role: 'MANAGER' } })).id
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } })
  await prisma.$disconnect()
})

describe('assistant conversations', () => {
  it('keeps a conversation under its first question', async () => {
    await saveChat(owner.id, chatId, [said('Welche Projekte laufen gerade?')])
    const chat = await loadChat(owner.id, chatId)
    expect(chat?.title).toBe('Welche Projekte laufen gerade?')
    expect(chat?.messages).toHaveLength(1)
    expect((await latestChat(owner.id))?.id).toBe(chatId)
  })

  it('is invisible and untouchable for anybody else', async () => {
    expect(await loadChat(other.id, chatId)).toBeNull()
    expect(await listChats(other.id, false)).toEqual([])
    expect(await mayWriteChat(other.id, chatId)).toBe(false)
    await saveChat(other.id, chatId, [said('überschrieben')])
    expect((await loadChat(owner.id, chatId))?.messages).toHaveLength(1)
    expect(await setChatArchived(other.id, chatId, true)).toBe(false)
    expect(await deleteChat(other.id, chatId)).toBe(false)
    expect(await loadChat(owner.id, chatId)).not.toBeNull()
  })

  it('moves to the archive and back when talked on', async () => {
    expect(await setChatArchived(owner.id, chatId, true)).toBe(true)
    expect((await listChats(owner.id, false)).map((c) => c.id)).not.toContain(chatId)
    expect((await listChats(owner.id, true)).map((c) => c.id)).toContain(chatId)
    expect(await latestChat(owner.id)).toBeNull()

    await saveChat(owner.id, chatId, [said('Welche Projekte laufen gerade?'), said('Und morgen?')])
    const back = await loadChat(owner.id, chatId)
    expect(back?.archived).toBe(false)
    expect(back?.title).toBe('Welche Projekte laufen gerade?')
  })

  it('is deleted by its owner only', async () => {
    expect(await deleteChat(owner.id, chatId)).toBe(true)
    expect(await loadChat(owner.id, chatId)).toBeNull()
  })
})
