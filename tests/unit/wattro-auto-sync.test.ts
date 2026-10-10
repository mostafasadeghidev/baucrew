import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The automatic run: only when configured, switched on and due; audited
// without a user.

const mocks = vi.hoisted(() => ({
  configured: true,
  lastAt: null as Date | null,
  sync: vi.fn(),
  audit: vi.fn(),
}))
vi.mock('@/lib/wattro/client', () => ({ isWattroConfigured: () => mocks.configured }))
vi.mock('@/lib/wattro/sync', () => ({
  getLastSync: async () => ({ at: mocks.lastAt, counts: null }),
  syncWattroDevices: (...args: unknown[]) => mocks.sync(...args),
}))
vi.mock('@/lib/audit', () => ({ audit: (...args: unknown[]) => mocks.audit(...args) }))

import { runScheduledSync } from '@/lib/wattro/auto-sync'

const counts = {
  created: 0,
  adopted: 0,
  updated: 3,
  unchanged: 400,
  deactivated: 0,
  invalid: 0,
  conflictCount: 0,
  conflicts: [],
  fetchedActive: 402,
  fetchedInactive: 1,
}
const now = new Date('2026-10-06T12:00:00Z')

beforeEach(() => {
  mocks.configured = true
  mocks.lastAt = null
  mocks.sync.mockReset().mockResolvedValue({ ok: true, counts })
  mocks.audit.mockReset()
  vi.stubEnv('WATTRO_SYNC_INTERVAL_MINUTES', '60')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('runScheduledSync', () => {
  it('runs when due and audits the run without a user', async () => {
    await expect(runScheduledSync(now)).resolves.toMatchObject({ ran: true, outcome: { ok: true } })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, action: 'device.wattroSync', newValue: expect.stringMatching(/^timer created:0 .*updated:3 /) })
    )
  })

  it('skips a run that comes early', async () => {
    mocks.lastAt = new Date(now.getTime() - 20 * 60_000)
    await expect(runScheduledSync(now)).resolves.toEqual({ ran: false, reason: 'notDue' })
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('does nothing when switched off or without a key', async () => {
    vi.stubEnv('WATTRO_SYNC_INTERVAL_MINUTES', '0')
    await expect(runScheduledSync(now)).resolves.toEqual({ ran: false, reason: 'off' })
    vi.stubEnv('WATTRO_SYNC_INTERVAL_MINUTES', '60')
    mocks.configured = false
    await expect(runScheduledSync(now)).resolves.toEqual({ ran: false, reason: 'notConfigured' })
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('audits a failed run, so a silent outage shows in the log', async () => {
    mocks.sync.mockResolvedValue({ ok: false, error: 'auth' })
    await runScheduledSync(now)
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'device.wattroSyncFailed', newValue: 'timer auth' }))
  })
})
