import 'server-only'

import { runScheduledSync, configuredSyncInterval } from './auto-sync'
import { TIMER_TICK_MINUTES } from './schedule'

/**
 * The automatic sync inside a long-running server (Docker, `next start`):
 * started once from src/instrumentation.ts, it looks every few minutes
 * whether a run is due and runs it. Looking often and running only when due
 * means a restart neither skips nor doubles a run.
 *
 * One timer per process, even if the module is loaded twice (development
 * reloads keep the process).
 */
const started = globalThis as unknown as { wattroTimer?: ReturnType<typeof setInterval> }

export function startWattroTimer() {
  if (started.wattroTimer || configuredSyncInterval() <= 0) return
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await runScheduledSync()
    } catch (e) {
      console.error('wattro: automatic sync crashed', e instanceof Error ? e.message : e)
    } finally {
      running = false
    }
  }
  started.wattroTimer = setInterval(tick, TIMER_TICK_MINUTES * 60_000)
  // Never hold the process open for the timer alone.
  started.wattroTimer.unref?.()
  // The first look a minute after start, once the server is serving.
  setTimeout(tick, 60_000).unref?.()
}
