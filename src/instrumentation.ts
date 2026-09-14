/**
 * Runs once when a server process starts: the webhook worker, which sends the
 * deliveries that are due — retries above all — once a minute.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { startWebhookWorker } = await import('./lib/webhooks')
  startWebhookWorker()
}
