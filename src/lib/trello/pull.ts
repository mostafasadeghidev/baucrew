import 'server-only'

/**
 * Trello's API, read only: the boards the key's account can see, and one
 * board as a complete file — the same shape "Export as JSON" gives (lists,
 * cards with fields, attachments, checklists, members, labels) plus every
 * comment, paged back in time, since Trello's own export stops at the last
 * 1,000 actions. `parseTrelloExport` (src/lib/trello.ts) reads the result.
 * Nothing here ever writes to Trello.
 */

const API = 'https://api.trello.com/1'
const TIMEOUT_MS = 30_000

export type TrelloBoardSummary = { id: string; name: string; closed: boolean; shortLink: string }

export function trelloCredentials(): { key: string; token: string } | null {
  const key = process.env.TRELLO_API_KEY?.trim()
  const token = process.env.TRELLO_TOKEN?.trim()
  return key && token ? { key, token } : null
}

export function isTrelloConfigured(): boolean {
  return trelloCredentials() !== null
}

export class TrelloApiError extends Error {
  readonly status: number
  constructor(status: number, path: string) {
    super(`trello ${status} ${path}`)
    this.status = status
  }
}

async function get(path: string): Promise<unknown> {
  const auth = trelloCredentials()
  if (!auth) throw new TrelloApiError(401, path)
  const response = await fetch(API + path, {
    headers: { Authorization: `OAuth oauth_consumer_key="${auth.key}", oauth_token="${auth.token}"` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!response.ok) throw new TrelloApiError(response.status, path.split('?')[0])
  return response.json()
}

/** Every board of the account the token belongs to, open ones first. */
export async function listTrelloBoards(): Promise<TrelloBoardSummary[]> {
  const rows = (await get('/members/me/boards?filter=all&fields=name,closed,shortLink')) as Array<Record<string, unknown>>
  return rows
    .filter((b) => typeof b.id === 'string' && typeof b.name === 'string')
    .map((b) => ({ id: b.id as string, name: b.name as string, closed: b.closed === true, shortLink: String(b.shortLink ?? '') }))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || a.name.localeCompare(b.name))
}

/** One board as the export file, comments included. */
export async function pullTrelloBoard(boardId: string): Promise<unknown> {
  const board = (await get(
    `/boards/${boardId}?fields=all&lists=all&list_fields=all&cards=all&card_fields=all&card_attachments=true&card_pluginData=true` +
      `&checklists=all&checklist_fields=all&members=all&member_fields=fullName,username&labels=all&pluginData=true`
  )) as Record<string, unknown>
  const comments: unknown[] = []
  let before: string | null = null
  for (let page = 0; page < 50; page++) {
    const rows = (await get(`/boards/${boardId}/actions?filter=commentCard&limit=1000${before ? `&before=${before}` : ''}`)) as Array<{ id: string }>
    comments.push(...rows)
    if (rows.length < 1000) break
    before = rows[rows.length - 1].id
  }
  board.actions = comments
  return board
}
