import 'server-only'

import { configuredTrelloInterval, runScheduledTrelloSync } from './auto-sync'
import { TIMER_TICK_MINUTES } from '@/lib/wattro/schedule'

/**
 * The automatic Trello sync inside a long-running server (Docker, `next
 * start`): started once from src/instrumentation.ts, it looks every few
 * minutes whether a run is due and runs it — the same clockwork as the
 * Wattro timer. One timer per process.
 */
const started = globalThis as unknown as { trelloTimer?: ReturnType<typeof setInterval> }

export function startTrelloTimer() {
  if (started.trelloTimer || configuredTrelloInterval() <= 0) return
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await runScheduledTrelloSync()
    } catch (e) {
      console.error('trello: automatic sync crashed', e instanceof Error ? e.message : e)
    } finally {
      running = false
    }
  }
  started.trelloTimer = setInterval(tick, TIMER_TICK_MINUTES * 60_000)
  started.trelloTimer.unref?.()
  // The first look two minutes after start, after the Wattro timer's first look.
  setTimeout(tick, 120_000).unref?.()
}
