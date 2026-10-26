import 'server-only'

/**
 * The automatic Trello sync: the server reads the boards of the account the
 * key belongs to, keeps a row per board (Settings → Trello), and for every
 * board switched on pulls the board from the API and runs the importer —
 * on a timer (./timer.ts) and on the button. Afterwards it fetches the files
 * the cards carry, a few rounds at a time. One way only, Trello → BauCrew,
 * until the day Trello is frozen; then every board is switched off.
 *
 * Documented in docs/TRELLO-RESYNC.md and docs/CHANGE-trello-auto-sync.md.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { parseTrelloExport } from '@/lib/trello'
import { fetchTrelloFiles, pendingTrelloFiles } from '@/lib/trello-files'
import { isSyncDue, syncIntervalMinutes } from '@/lib/wattro/schedule'
import { isTrelloConfigured, listTrelloBoards, pullTrelloBoard, TrelloApiError } from './pull'
import { importSummary, runTrelloImport } from './import'
import { syncOptionsFor } from './sync-options'

const LAST_SYNC_KEY = 'trello.lastSyncAt'
/** Rounds of file fetching after the boards, each a few files; the rest waits for the next run. */
const FILE_ROUNDS_PER_RUN = 40

/** The interval this server runs with: TRELLO_SYNC_INTERVAL_MINUTES, 60 in production, off in development. */
export function configuredTrelloInterval(): number {
  return syncIntervalMinutes(process.env.TRELLO_SYNC_INTERVAL_MINUTES, process.env.NODE_ENV === 'production')
}

export type SyncBoardOutcome = { id: string; name: string; ok: true; summary: string } | { id: string; name: string; ok: false; error: string }

export type TrelloSyncOutcome = {
  ok: boolean
  /** Why nothing ran, when nothing ran. */
  error?: 'notConfigured' | 'auth' | 'network' | 'upstream'
  boards: SyncBoardOutcome[]
  files: { fetched: number; failed: number; pending: number }
}

function errorKind(e: unknown): 'auth' | 'network' | 'upstream' {
  if (e instanceof TrelloApiError) return e.status === 401 || e.status === 403 ? 'auth' : 'upstream'
  return 'network'
}

/** The boards on the account, their rows kept in step: a new board arrives switched off, a renamed one keeps its row. */
export async function discoverTrelloBoards() {
  const found = await listTrelloBoards()
  for (const [i, b] of found.entries()) {
    await db.trelloSyncBoard.upsert({
      where: { id: b.id },
      create: { id: b.id, name: b.name, closed: b.closed, sortOrder: i },
      update: { name: b.name, closed: b.closed, sortOrder: i },
    })
  }
  return db.trelloSyncBoard.findMany({ orderBy: [{ closed: 'asc' }, { sortOrder: 'asc' }] })
}

export async function getLastTrelloSync(): Promise<Date | null> {
  const row = await db.appSetting.findUnique({ where: { key: LAST_SYNC_KEY } })
  const at = row ? new Date(row.value) : null
  return at && !Number.isNaN(at.getTime()) ? at : null
}

/**
 * One run over the boards switched on (or the ones named), then the files.
 * `userId` is who pressed the button, null for the timer.
 */
export async function syncTrelloBoards(trigger: 'manual' | 'timer', userId: string | null, onlyIds?: string[]): Promise<TrelloSyncOutcome> {
  const files = { fetched: 0, failed: 0, pending: 0 }
  if (!isTrelloConfigured()) return { ok: false, error: 'notConfigured', boards: [], files }
  let rows
  try {
    rows = await discoverTrelloBoards()
  } catch (e) {
    return { ok: false, error: errorKind(e), boards: [], files }
  }
  const boards: SyncBoardOutcome[] = []
  for (const row of rows) {
    if (onlyIds ? !onlyIds.includes(row.id) : !row.enabled) continue
    try {
      const board = parseTrelloExport(await pullTrelloBoard(row.id))
      if (!board) throw new Error('unreadable')
      const result = await runTrelloImport(board, syncOptionsFor(board, row), userId)
      const summary = importSummary(board.name, result)
      await db.trelloSyncBoard.update({ where: { id: row.id }, data: { lastRunAt: new Date(), lastResult: summary, lastError: null } })
      boards.push({ id: row.id, name: row.name, ok: true, summary })
    } catch (e) {
      const error = e instanceof TrelloApiError ? `trello ${e.status}` : e instanceof Error ? e.message.slice(0, 200) : 'error'
      await db.trelloSyncBoard.update({ where: { id: row.id }, data: { lastError: error } })
      console.warn('trello sync: board failed', { board: row.id, error })
      boards.push({ id: row.id, name: row.name, ok: false, error })
    }
  }
  // The files the cards carry, a few rounds; what is left waits for the next run.
  for (let round = 0; round < FILE_ROUNDS_PER_RUN; round++) {
    const r = await fetchTrelloFiles(userId)
    files.fetched += r.fetched
    files.failed += r.failed
    files.pending = r.pending
    if (!r.configured || r.pending === 0 || r.fetched === 0) break
  }
  if (files.pending === 0) files.pending = await pendingTrelloFiles()
  await db.appSetting.upsert({ where: { key: LAST_SYNC_KEY }, create: { key: LAST_SYNC_KEY, value: new Date().toISOString() }, update: { value: new Date().toISOString() } })
  const by = trigger === 'timer' ? 'timer ' : ''
  await audit({
    userId,
    action: 'trello.sync',
    entity: 'System',
    entityId: 'trello',
    newValue: `${by}${boards.filter((b) => b.ok).length} boards, ${boards.filter((b) => !b.ok).length} failed, files ${files.fetched} fetched ${files.pending} pending`,
  })
  return { ok: boards.every((b) => b.ok), boards, files }
}

export type ScheduledTrelloRun = { ran: false; reason: 'off' | 'notConfigured' | 'notDue' | 'nothingOn' } | { ran: true; outcome: TrelloSyncOutcome }

/** One automatic run, if one is due: configured, switched on, a board enabled, and the last run older than the interval. */
export async function runScheduledTrelloSync(now = new Date()): Promise<ScheduledTrelloRun> {
  const interval = configuredTrelloInterval()
  if (interval <= 0) return { ran: false, reason: 'off' }
  if (!isTrelloConfigured()) return { ran: false, reason: 'notConfigured' }
  if ((await db.trelloSyncBoard.count({ where: { enabled: true } })) === 0) return { ran: false, reason: 'nothingOn' }
  if (!isSyncDue(await getLastTrelloSync(), now, interval)) return { ran: false, reason: 'notDue' }
  return { ran: true, outcome: await syncTrelloBoards('timer', null) }
}
