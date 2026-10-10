import 'server-only'

import { audit } from '@/lib/audit'
import type { WattroSyncOutcome } from './assets'
import { isWattroConfigured } from './client'
import { isSyncDue, syncIntervalMinutes } from './schedule'
import { getLastSync, syncWattroDevices } from './sync'

/** The interval this server runs with (see ./schedule). */
export function configuredSyncInterval(): number {
  return syncIntervalMinutes(process.env.WATTRO_SYNC_INTERVAL_MINUTES, process.env.NODE_ENV === 'production')
}

/** Every run lands in the audit log — a click with its user, an automatic one without. */
export async function recordSyncRun(userId: string | null, outcome: WattroSyncOutcome, trigger: 'manual' | 'timer') {
  const by = trigger === 'manual' ? '' : `${trigger} `
  if (outcome.ok) {
    const c = outcome.counts
    await audit({
      userId,
      action: 'device.wattroSync',
      entity: 'System',
      entityId: 'wattro',
      newValue:
        `${by}created:${c.created} adopted:${c.adopted} updated:${c.updated} unchanged:${c.unchanged} ` +
        `deactivated:${c.deactivated} invalid:${c.invalid} conflicts:${c.conflictCount}`,
    })
  } else {
    await audit({
      userId,
      action: 'device.wattroSyncFailed',
      entity: 'System',
      entityId: 'wattro',
      newValue: `${by}${outcome.error}`,
    })
  }
}

export type ScheduledRun =
  | { ran: false; reason: 'off' | 'notConfigured' | 'notDue' }
  | { ran: true; outcome: WattroSyncOutcome }

/**
 * One automatic run, if one is due: Wattro configured, automatic runs on,
 * and the last successful run older than the interval. A failed run leaves
 * the stamp where it was, so the next tick tries again.
 */
export async function runScheduledSync(now = new Date()): Promise<ScheduledRun> {
  const interval = configuredSyncInterval()
  if (interval <= 0) return { ran: false, reason: 'off' }
  if (!isWattroConfigured()) return { ran: false, reason: 'notConfigured' }
  const { at } = await getLastSync()
  if (!isSyncDue(at, now, interval)) return { ran: false, reason: 'notDue' }

  const outcome = await syncWattroDevices()
  await recordSyncRun(null, outcome, 'timer')
  if (!outcome.ok) console.warn('wattro: automatic sync failed', { error: outcome.error })
  return { ran: true, outcome }
}
