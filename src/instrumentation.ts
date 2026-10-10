/**
 * Runs once when a server process starts: the webhook worker, which sends the
 * deliveries that are due — retries above all — once a minute; and the
 * automatic Wattro sync, which looks every few minutes whether an hourly read
 * is due. Both need a long-running server — the Docker container is one.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { startWebhookWorker } = await import('./lib/webhooks')
  startWebhookWorker()
  const { startWattroTimer } = await import('./lib/wattro/timer')
  startWattroTimer()
}
