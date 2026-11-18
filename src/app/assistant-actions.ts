'use server'

import { getCurrentUser } from '@/lib/auth'
import { toolNamesFor } from '@/lib/mcp-catalog'
import { deleteChat, latestChat, listChats, loadChat, setChatArchived } from '@/lib/assistant-chats'

// The assistant panel's history: the signed-in person's own conversations,
// listed, opened, put away, brought back and deleted. Only somebody the
// assistant works for at all reaches them.

async function assistantUser() {
  const user = await getCurrentUser()
  return user && toolNamesFor(user).length > 0 ? user : null
}

export async function listAssistantChats(archived: boolean) {
  const user = await assistantUser()
  return user ? listChats(user.id, archived) : []
}

export async function openAssistantChat(id: string) {
  const user = await assistantUser()
  return user ? loadChat(user.id, id) : null
}

export async function latestAssistantChat() {
  const user = await assistantUser()
  return user ? latestChat(user.id) : null
}

export async function archiveAssistantChat(id: string, archived: boolean) {
  const user = await assistantUser()
  return user ? setChatArchived(user.id, id, archived) : false
}

export async function deleteAssistantChat(id: string) {
  const user = await assistantUser()
  return user ? deleteChat(user.id, id) : false
}
