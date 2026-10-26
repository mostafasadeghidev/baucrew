import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The automatic Trello run: only when configured, a board is switched on and
// a run is due; every board switched on is pulled and imported, a board that
// fails leaves the others alone, and the run is audited without a user.

const mocks = vi.hoisted(() => ({
  configured: true,
  rows: [] as Array<{ id: string; name: string; enabled: boolean; includeArchived: boolean; makeBoard: boolean; oneCustomer: boolean | null; listStatus: unknown }>,
  lastAt: null as string | null,
  pull: vi.fn(),
  run: vi.fn(),
  fetchFiles: vi.fn(),
  audit: vi.fn(),
  updates: [] as unknown[],
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/trello/pull', () => ({
  isTrelloConfigured: () => mocks.configured,
  listTrelloBoards: async () => mocks.rows.map((r) => ({ id: r.id, name: r.name, closed: false, shortLink: 'x' })),
  pullTrelloBoard: (...args: unknown[]) => mocks.pull(...args),
  TrelloApiError: class extends Error {
    status: number
    constructor(status: number) {
      super(`trello ${status}`)
      this.status = status
    }
  },
}))
vi.mock('@/lib/trello/import', () => ({
  runTrelloImport: (...args: unknown[]) => mocks.run(...args),
  importSummary: (name: string) => `${name}: ok`,
}))
vi.mock('@/lib/trello-files', () => ({
  fetchTrelloFiles: (...args: unknown[]) => mocks.fetchFiles(...args),
  pendingTrelloFiles: async () => 0,
}))
vi.mock('@/lib/audit', () => ({ audit: (...args: unknown[]) => mocks.audit(...args) }))
vi.mock('@/lib/db', () => ({
  db: {
    trelloSyncBoard: {
      upsert: async () => ({}),
      findMany: async () => mocks.rows,
      count: async ({ where }: { where: { enabled: boolean } }) => mocks.rows.filter((r) => r.enabled === where.enabled).length,
      update: async (args: unknown) => {
        mocks.updates.push(args)
        return {}
      },
    },
    appSetting: {
      findUnique: async () => (mocks.lastAt ? { key: 'trello.lastSyncAt', value: mocks.lastAt } : null),
      upsert: async () => ({}),
    },
  },
}))

import { runScheduledTrelloSync, syncTrelloBoards } from '@/lib/trello/auto-sync'

const LIST = 'a'.repeat(24)
const exportOf = (name: string) => ({
  id: 'c'.repeat(24),
  name,
  lists: [{ id: LIST, name: 'Aufträge', pos: 1 }],
  cards: [{ id: 'b'.repeat(24), name: 'Muster (4100001)', idList: LIST, closed: false, pos: 1 }],
})
const row = (id: string, name: string, enabled: boolean) => ({ id, name, enabled, includeArchived: true, makeBoard: true, oneCustomer: null, listStatus: {} })
const result = { created: 1, updated: 0, customersCreated: 1, ignored: 0, flagged: 0, comments: 0, checklists: 0, links: 0, templates: 0, fields: 0, columns: 1, unknownMembers: [] }

beforeEach(() => {
  mocks.configured = true
  mocks.lastAt = null
  mocks.rows = [row('1'.repeat(24), 'Sites', true), row('2'.repeat(24), 'Applicants', false)]
  mocks.updates = []
  mocks.pull.mockReset().mockImplementation(async (id: string) => exportOf(id === '1'.repeat(24) ? 'Sites' : 'Applicants'))
  mocks.run.mockReset().mockResolvedValue(result)
  mocks.fetchFiles.mockReset().mockResolvedValue({ fetched: 0, failed: 0, pending: 0, configured: true })
  mocks.audit.mockReset()
  vi.stubEnv('TRELLO_SYNC_INTERVAL_MINUTES', '60')
})
afterEach(() => vi.unstubAllEnvs())

describe('syncTrelloBoards', () => {
  it('pulls and imports every board switched on, nothing else, and audits the run', async () => {
    const outcome = await syncTrelloBoards('timer', null)
    expect(outcome.ok).toBe(true)
    expect(mocks.pull).toHaveBeenCalledTimes(1)
    expect(mocks.pull).toHaveBeenCalledWith('1'.repeat(24))
    expect(mocks.run).toHaveBeenCalledTimes(1)
    expect(mocks.run.mock.calls[0][2]).toBeNull()
    expect(outcome.boards).toEqual([{ id: '1'.repeat(24), name: 'Sites', ok: true, summary: 'Sites: ok' }])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: null, action: 'trello.sync' }))
  })

  it('runs the one board named even when it is switched off', async () => {
    const outcome = await syncTrelloBoards('manual', 'user1', ['2'.repeat(24)])
    expect(mocks.pull).toHaveBeenCalledWith('2'.repeat(24))
    expect(outcome.boards[0]).toMatchObject({ id: '2'.repeat(24), ok: true })
  })

  it('keeps going when one board fails and records the error on that board', async () => {
    mocks.rows = [row('1'.repeat(24), 'Sites', true), row('3'.repeat(24), 'Sales', true)]
    mocks.pull.mockImplementation(async (id: string) => {
      if (id === '1'.repeat(24)) throw new Error('boom')
      return exportOf('Sales')
    })
    const outcome = await syncTrelloBoards('timer', null)
    expect(outcome.ok).toBe(false)
    expect(outcome.boards).toEqual([
      { id: '1'.repeat(24), name: 'Sites', ok: false, error: 'boom' },
      { id: '3'.repeat(24), name: 'Sales', ok: true, summary: 'Sales: ok' },
    ])
    expect(mocks.updates).toContainEqual(expect.objectContaining({ data: { lastError: 'boom' } }))
  })

  it('fetches files after the boards, round by round, until nothing is pending', async () => {
    mocks.fetchFiles
      .mockResolvedValueOnce({ fetched: 20, failed: 0, pending: 5, configured: true })
      .mockResolvedValueOnce({ fetched: 5, failed: 0, pending: 0, configured: true })
    const outcome = await syncTrelloBoards('timer', null)
    expect(mocks.fetchFiles).toHaveBeenCalledTimes(2)
    expect(outcome.files).toEqual({ fetched: 25, failed: 0, pending: 0 })
  })

  it('does nothing without a key', async () => {
    mocks.configured = false
    expect(await syncTrelloBoards('timer', null)).toMatchObject({ ok: false, error: 'notConfigured' })
    expect(mocks.pull).not.toHaveBeenCalled()
  })
})

describe('runScheduledTrelloSync', () => {
  it('runs when due, and only then', async () => {
    expect(await runScheduledTrelloSync(new Date('2026-10-17T12:00:00Z'))).toMatchObject({ ran: true })
    mocks.lastAt = '2026-10-17T11:30:00Z'
    expect(await runScheduledTrelloSync(new Date('2026-10-17T12:00:00Z'))).toEqual({ ran: false, reason: 'notDue' })
    mocks.lastAt = '2026-10-17T10:30:00Z'
    expect(await runScheduledTrelloSync(new Date('2026-10-17T12:00:00Z'))).toMatchObject({ ran: true })
  })

  it('stays off with no board switched on, with the interval at 0, or without a key', async () => {
    mocks.rows = [row('2'.repeat(24), 'Applicants', false)]
    expect(await runScheduledTrelloSync()).toEqual({ ran: false, reason: 'nothingOn' })
    mocks.rows = [row('1'.repeat(24), 'Sites', true)]
    vi.stubEnv('TRELLO_SYNC_INTERVAL_MINUTES', '0')
    expect(await runScheduledTrelloSync()).toEqual({ ran: false, reason: 'off' })
    vi.stubEnv('TRELLO_SYNC_INTERVAL_MINUTES', '60')
    mocks.configured = false
    expect(await runScheduledTrelloSync()).toEqual({ ran: false, reason: 'notConfigured' })
  })
})
