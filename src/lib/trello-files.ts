import 'server-only'
import { randomUUID } from 'crypto'
import { db } from './db'
import { deleteStoredFile, saveStoredFile } from './file-storage'
import { MAX_FILE_SIZE, fetchedFileType, storageKeyFor } from './files'
import { trelloDownload } from './trello'

/**
 * The files attached to Trello cards. The board export names them but does
 * not hold them, and Trello hands a file only to somebody it knows — so the
 * import keeps each as a link to Trello on its card, and this turns the links
 * into files here once an API key and a token are set (TRELLO_API_KEY,
 * TRELLO_TOKEN; a read-only token is enough, and nothing is ever written to
 * Trello). A link that has become a file is removed; one Trello refuses stays
 * a link, so nothing is lost either way.
 */

const pendingWhere = { url: { startsWith: 'https://trello.com/1/cards/', contains: '/download/' } }

export async function pendingTrelloFiles(): Promise<number> {
  return db.cardLink.count({ where: pendingWhere })
}

function credentials(): { key: string; token: string } | null {
  const key = process.env.TRELLO_API_KEY?.trim()
  const token = process.env.TRELLO_TOKEN?.trim()
  return key && token ? { key, token } : null
}

/** How many files one round fetches — small enough that a round answers before a browser gives up on it. */
const ROUND = 20
/** How long one file may take to arrive before the round moves on. */
const FETCH_TIMEOUT_MS = 30_000
/**
 * A link Trello refused is left alone for a while, so a shelf of files that
 * will never come does not fill every round and starve the ones that would.
 * Kept in memory: a restart gives them all one more try, which is fine.
 */
const DECLINE_FOR_MS = 6 * 60 * 60 * 1000
const declined = new Map<string, number>()

function declinedIds(now: number): string[] {
  for (const [id, at] of declined) if (now - at > DECLINE_FOR_MS) declined.delete(id)
  return [...declined.keys()]
}

/** The body, read up to the size limit and not a byte further. */
async function readCapped(response: Response): Promise<Buffer | 'size'> {
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_FILE_SIZE) return 'size'
  if (!response.body) return 'size'
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_FILE_SIZE) {
      await reader.cancel().catch(() => {})
      return 'size'
    }
    chunks.push(value)
  }
  return total === 0 ? 'size' : Buffer.concat(chunks)
}

export async function fetchTrelloFiles(userId: string | null): Promise<{ fetched: number; failed: number; pending: number; configured: boolean }> {
  const auth = credentials()
  if (!auth) return { fetched: 0, failed: 0, pending: await pendingTrelloFiles(), configured: false }
  const headers = { Authorization: `OAuth oauth_consumer_key="${auth.key}", oauth_token="${auth.token}"` }

  // Oldest first, past the ones Trello refused lately and past the ones that
  // fail this round, so a file Trello refuses does not hold up the rest.
  const skip = declinedIds(Date.now())
  const links = await db.cardLink.findMany({
    where: { ...pendingWhere, ...(skip.length ? { id: { notIn: skip } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: ROUND * 3,
  })
  let fetched = 0
  let failed = 0
  const covers = new Map<string, string | null>()
  for (const link of links) {
    if (fetched >= ROUND) break
    const target = trelloDownload(link.url)
    if (!target) continue
    try {
      const response = await fetch(link.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!response.ok) throw new Error(String(response.status))
      const data = await readCapped(response)
      if (data === 'size') throw new Error('size')
      const filename = link.title || decodeURIComponent(link.url.split('/').pop() ?? '') || 'datei'
      const mimeType = fetchedFileType(filename, response.headers.get('content-type'))
      const key = storageKeyFor(link.projectId, randomUUID(), filename)
      await saveStoredFile(key, data)
      // The row after the file, and the file taken back when the row fails —
      // a file nobody can find is a file nobody can delete.
      const document = await db.document
        .create({
          data: { projectId: link.projectId, filename, mimeType, size: data.length, path: key, source: 'trello', uploadedById: userId, createdAt: link.createdAt },
          select: { id: true },
        })
        .catch(async (e: unknown) => {
          await deleteStoredFile(key).catch(() => {})
          throw e
        })
      await db.cardLink.delete({ where: { id: link.id } })
      fetched++

      // The card's cover picture, asked of Trello once per card.
      if (!covers.has(target.cardId)) {
        const card = await fetch(`https://api.trello.com/1/cards/${target.cardId}?fields=idAttachmentCover`, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
          .then((r) => (r.ok ? (r.json() as Promise<{ idAttachmentCover?: string | null }>) : null))
          .catch(() => null)
        covers.set(target.cardId, card?.idAttachmentCover ?? null)
      }
      if (covers.get(target.cardId) === target.attachmentId) {
        await db.project.updateMany({ where: { id: link.projectId, coverDocumentId: null }, data: { coverDocumentId: document.id } })
      }
    } catch {
      declined.set(link.id, Date.now())
      failed++
    }
  }
  return { fetched, failed, pending: await pendingTrelloFiles(), configured: true }
}
