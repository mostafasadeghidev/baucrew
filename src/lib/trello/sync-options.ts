/**
 * What a board runs with when the server brings it in by itself — decided
 * from the board and its row, so nobody has to map anything: a list becomes
 * the status its name says (suggestStatus, the same rule the wizard proposes),
 * unless somebody pinned it; a board whose cards name no customer and carry
 * no job number is a board of tasks or references and files under one
 * customer. Pure, so it is tested without Trello or a database.
 */

import { ProjectStatus } from '@/generated/prisma/enums'
import { splitCardTitle, suggestStatus, type TrelloBoard } from '@/lib/trello'
import type { TrelloImportOptions } from './import'

export type SyncBoardRow = {
  includeArchived: boolean
  makeBoard: boolean
  /** Null = read off the cards. */
  oneCustomer: boolean | null
  /** list id → status or "SKIP", where pinned; anything else is ignored. */
  listStatus: unknown
}

const STATUSES = new Set(Object.keys(ProjectStatus))

export function isStatusOrSkip(v: unknown): v is ProjectStatus | 'SKIP' {
  return v === 'SKIP' || (typeof v === 'string' && STATUSES.has(v))
}

/** The pinned lists of a row, every other value dropped. */
export function pinnedLists(listStatus: unknown): Record<string, ProjectStatus | 'SKIP'> {
  if (!listStatus || typeof listStatus !== 'object' || Array.isArray(listStatus)) return {}
  const out: Record<string, ProjectStatus | 'SKIP'> = {}
  for (const [id, v] of Object.entries(listStatus as Record<string, unknown>)) if (isStatusOrSkip(v)) out[id] = v
  return out
}

/** The status a list's cards get: pinned, else by the list's name, else planned. */
export function statusForList(listId: string, listName: string, pinned: Record<string, ProjectStatus | 'SKIP'>): ProjectStatus | 'SKIP' {
  const pin = pinned[listId]
  if (pin) return pin
  const guess = suggestStatus(listName)
  return isStatusOrSkip(guess) && guess !== 'SKIP' ? guess : 'PLANNED'
}

/** A board of customer jobs names customers on its cards or numbers them; one that does neither is tasks or references. */
export function looksLikeOneCustomer(board: TrelloBoard): boolean {
  if (board.cards.length === 0) return false
  return board.cards.every((card) => !card.fields.customerName && !splitCardTitle(card.name).number)
}

export function syncOptionsFor(board: TrelloBoard, row: SyncBoardRow): TrelloImportOptions {
  const pinned = pinnedLists(row.listStatus)
  const mapping = new Map<string, ProjectStatus | 'SKIP'>()
  for (const list of board.lists) mapping.set(list.id, statusForList(list.id, list.name, pinned))
  return {
    mapping,
    includeArchived: row.includeArchived,
    makeBoard: row.makeBoard,
    oneCustomer: row.oneCustomer ?? looksLikeOneCustomer(board),
    want: { fields: true, checklists: true, comments: true, templates: false },
  }
}
