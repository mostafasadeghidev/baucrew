/**
 * What the app tells an automation — n8n, for one — and how: the events, the
 * body every one of them travels in, the signature the receiver checks, and
 * when a delivery that failed is tried again.
 *
 * Pure, so the rules are tested without a database or a network.
 */

import { createHmac } from 'crypto'

/** The events an endpoint can listen for. */
export const WEBHOOK_EVENTS = ['project.created', 'project.status_changed', 'project.updated', 'project.deleted'] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export const isWebhookEvent = (value: string): value is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(value)

/** Sent from the settings page to one endpoint, whatever it listens for. */
export const TEST_EVENT = 'webhook.test'

export const EVENT_HEADER = 'X-BauCrew-Event'
export const DELIVERY_HEADER = 'X-BauCrew-Delivery'
export const SIGNATURE_HEADER = 'X-BauCrew-Signature'

/**
 * The signature of a body: HMAC-SHA256 with the endpoint's secret over the
 * body exactly as sent, hex, prefixed with the algorithm. The receiver computes
 * the same over the raw body it got and compares.
 */
export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`
}

/** Every event travels in the same body. `id` is the event's, shared by every endpoint it goes to. */
export function envelope(id: string, event: string, occurredAt: Date, data: unknown) {
  return { id, event, occurredAt: occurredAt.toISOString(), data }
}

/**
 * How long to wait after a failed attempt before the next: a minute, five,
 * half an hour, two hours, six, a day. After the last the delivery is given
 * up, and stays in the list to be sent again by hand.
 */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000, 24 * 3_600_000]
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1

/** The wait before the next attempt, after `failed` attempts that failed; null when there is none. */
export function retryDelay(failed: number): number | null {
  if (failed < 1) return 0
  return failed >= MAX_ATTEMPTS ? null : RETRY_DELAYS_MS[failed - 1]
}

/** An address to post to: http or https, with a host. */
export function isWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

/** A system name as links are kept: "trello", "wattro" — lower case, letters, digits, - and _. */
export function normalizeSystem(value: string): string | null {
  const system = value.trim().toLowerCase()
  return /^[a-z0-9_-]{1,40}$/.test(system) ? system : null
}

/** The short link of a Trello card address ("https://trello.com/c/AbC123xy/12-title"), or null. */
export function trelloShortLink(url: string | null | undefined): string | null {
  const match = url ? /trello\.com\/c\/([A-Za-z0-9]{6,})/.exec(url) : null
  return match ? match[1] : null
}

// ── What changed on a project ────────────────────────────────

/** A project as the events compare it: plain values, days as YYYY-MM-DD, money as numbers. */
export type ProjectSnapshot = {
  id: string
  status: string
  name: string
  customerId: string
  managerId: string | null
  plannedStart: string | null
  plannedEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  price: number | null
  /** Price with the follow-on offers. */
  orderValue: number | null
  isSub: boolean
  street: string | null
  postalCode: string | null
  city: string | null
  description: string | null
}

/** The fields whose change is told as `project.updated`; the status has an event of its own. */
export const WATCHED_FIELDS = [
  'name',
  'customerId',
  'managerId',
  'plannedStart',
  'plannedEnd',
  'actualStart',
  'actualEnd',
  'price',
  'orderValue',
  'isSub',
  'street',
  'postalCode',
  'city',
  'description',
] as const
export type WatchedField = (typeof WATCHED_FIELDS)[number]

export type FieldChange = { from: string | number | boolean | null; to: string | number | boolean | null }

export function projectChanges(
  before: ProjectSnapshot,
  after: ProjectSnapshot
): { status: { from: string; to: string } | null; fields: Partial<Record<WatchedField, FieldChange>> } {
  const fields: Partial<Record<WatchedField, FieldChange>> = {}
  for (const field of WATCHED_FIELDS) {
    if (before[field] !== after[field]) fields[field] = { from: before[field], to: after[field] }
  }
  return { status: before.status === after.status ? null : { from: before.status, to: after.status }, fields }
}

/**
 * Since when a project has stood in its status: the last time the status was
 * changed, or — never changed — when the job came into being, on the board it
 * came from if it came from one.
 */
export function statusSinceOf(lastChange: Date | null, sourceCreatedAt: Date | null, createdAt: Date): Date {
  return lastChange ?? sourceCreatedAt ?? createdAt
}
