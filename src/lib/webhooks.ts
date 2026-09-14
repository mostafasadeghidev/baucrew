/**
 * Telling automations what happened: every event is written down first, one
 * delivery per endpoint that listens for it, and sent from there — right after
 * the request that caused it, and again later while the endpoint does not take
 * it. A crash, a restart or an n8n that is down loses nothing: the delivery
 * waits in the table until it is taken or its attempts run out.
 *
 * A failing automation must never fail the app: nothing here throws at the
 * place an event is raised.
 *
 * No `server-only` here: the worker in `src/instrumentation.ts` imports it.
 */

import { after } from 'next/server'
import { randomBytes, randomUUID } from 'crypto'
import type { Prisma } from '@/generated/prisma/client'
import { db } from './db'
import {
  DELIVERY_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  TEST_EVENT,
  envelope,
  retryDelay,
  signBody,
  type WebhookEvent,
} from './webhook-events'

/** How long one attempt may take before it counts as failed. */
const TIMEOUT_MS = 10_000
/** How long a claimed delivery is left alone by other workers while it is being sent. */
const LEASE_MS = 2 * 60_000

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`
}

/**
 * Queues an event for every active endpoint that listens for it and starts
 * sending once the current request is answered.
 */
export async function emitEvent(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  try {
    const endpoints = await db.webhookEndpoint.findMany({
      where: { active: true, events: { has: event } },
      select: { id: true },
    })
    if (endpoints.length === 0) return
    const payload = envelope(randomUUID(), event, new Date(), data) as unknown as Prisma.InputJsonValue
    await db.webhookDelivery.createMany({
      data: endpoints.map((endpoint) => ({ endpointId: endpoint.id, event, payload })),
    })
    sendSoon()
  } catch (e) {
    console.error('webhook emit failed', e)
  }
}

/** After the response when there is a request to wait for; otherwise the worker picks it up within a minute. */
function sendSoon() {
  try {
    after(() => processDueDeliveries())
  } catch {
    /* not inside a request */
  }
}

/** Sends what is due. Returns how many were taken. */
export async function processDueDeliveries(limit = 25): Promise<number> {
  try {
    const due = await db.webhookDelivery.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    })
    let taken = 0
    for (const { id } of due) if ((await attempt(id)).ok) taken++
    return taken
  } catch (e) {
    console.error('webhook delivery failed', e)
    return 0
  }
}

export type AttemptResult = { ok: boolean; status: number | null; error: string | null }

/**
 * One attempt at one delivery. It is claimed first, so two workers — the one
 * after a request and the one on the clock — never send it twice at once.
 * `now` sends it whatever its next attempt says: a test, or a resend by hand.
 */
async function attempt(id: string, now = false): Promise<AttemptResult> {
  const claimed = await db.webhookDelivery.updateMany({
    where: { id, status: 'pending', ...(now ? {} : { nextAttemptAt: { lte: new Date() } }) },
    data: { nextAttemptAt: new Date(Date.now() + LEASE_MS) },
  })
  if (claimed.count === 0) return { ok: false, status: null, error: 'notDue' }
  const delivery = await db.webhookDelivery.findUnique({ where: { id }, include: { endpoint: true } })
  if (!delivery) return { ok: false, status: null, error: 'notFound' }

  const body = JSON.stringify(delivery.payload)
  let status: number | null = null
  let error: string | null = null
  try {
    const res = await fetch(delivery.endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BauCrew-Webhooks/1',
        [EVENT_HEADER]: delivery.event,
        [DELIVERY_HEADER]: delivery.id,
        [SIGNATURE_HEADER]: signBody(delivery.endpoint.secret, body),
      },
      body,
      // A redirect is an address that is wrong; following it would send the body elsewhere.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    status = res.status
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => '')
      error = `HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`
    }
  } catch (e) {
    error = e instanceof Error ? (e.cause instanceof Error ? `${e.message}: ${e.cause.message}` : e.message) : String(e)
  }

  const attempts = delivery.attempts + 1
  if (!error) {
    await db.webhookDelivery.update({
      where: { id },
      data: { status: 'delivered', attempts, responseStatus: status, lastError: null, deliveredAt: new Date() },
    })
    return { ok: true, status, error: null }
  }
  const wait = retryDelay(attempts)
  await db.webhookDelivery.update({
    where: { id },
    data: {
      attempts,
      responseStatus: status,
      lastError: error.slice(0, 500),
      status: wait === null ? 'failed' : 'pending',
      nextAttemptAt: new Date(Date.now() + (wait ?? 0)),
    },
  })
  return { ok: false, status, error }
}

/** Sends a test event to one endpoint now and says what came back. */
export async function sendTestEvent(endpointId: string): Promise<AttemptResult> {
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id: endpointId }, select: { id: true, name: true } })
  if (!endpoint) return { ok: false, status: null, error: 'notFound' }
  const payload = envelope(randomUUID(), TEST_EVENT, new Date(), {
    message: 'Test from BauCrew',
    endpoint: endpoint.name,
  }) as unknown as Prisma.InputJsonValue
  const delivery = await db.webhookDelivery.create({
    data: { endpointId, event: TEST_EVENT, payload },
    select: { id: true },
  })
  return attempt(delivery.id, true)
}

/** A delivery that failed, or waits, is sent again now, with a fresh count of attempts. */
export async function resendDelivery(id: string): Promise<AttemptResult> {
  const reset = await db.webhookDelivery.updateMany({
    where: { id, status: { in: ['failed', 'pending'] } },
    data: { status: 'pending', attempts: 0, nextAttemptAt: new Date() },
  })
  if (reset.count === 0) return { ok: false, status: null, error: 'notFound' }
  return attempt(id, true)
}

/** Delivered messages are kept a month for the list, given-up ones a quarter. */
const KEEP_DELIVERED_MS = 30 * 24 * 3_600_000
const KEEP_FAILED_MS = 90 * 24 * 3_600_000

export async function pruneDeliveries(now = Date.now()): Promise<void> {
  try {
    await db.webhookDelivery.deleteMany({
      where: {
        OR: [
          { status: 'delivered', createdAt: { lt: new Date(now - KEEP_DELIVERED_MS) } },
          { status: 'failed', createdAt: { lt: new Date(now - KEEP_FAILED_MS) } },
        ],
      },
    })
  } catch (e) {
    console.error('webhook prune failed', e)
  }
}

const WORKER = Symbol.for('baucrew.webhookWorker')

/**
 * Once a minute, what is due goes out: the retries, and whatever was raised
 * outside a request; once an hour, old deliveries go. A tick that is still
 * sending when the next one comes lets that one pass. Started once per server
 * process from instrumentation.
 */
export function startWebhookWorker(): void {
  const store = globalThis as unknown as Record<symbol, ReturnType<typeof setInterval> | undefined>
  if (store[WORKER]) return
  let busy = false
  let ticks = 0
  const timer = setInterval(async () => {
    if (busy) return
    busy = true
    try {
      await processDueDeliveries()
      if (ticks++ % 60 === 0) await pruneDeliveries()
    } finally {
      busy = false
    }
  }, 60_000)
  timer.unref?.()
  store[WORKER] = timer
}
