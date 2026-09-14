'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { isWebhookEvent, isWebhookUrl } from '@/lib/webhook-events'
import { newWebhookSecret, resendDelivery, sendTestEvent, type AttemptResult } from '@/lib/webhooks'

const PATH = '/settings/webhooks'

export type WebhookFormState = { error?: 'nameRequired' | 'urlInvalid' | 'eventsRequired' | 'saveFailed'; ok?: boolean }

/** An automation's address and the events it wants. The secret is made here. */
export async function createWebhook(_prev: WebhookFormState, formData: FormData): Promise<WebhookFormState> {
  const admin = await requireAdmin()
  const name = String(formData.get('name') ?? '').trim().slice(0, 120)
  const url = String(formData.get('url') ?? '').trim().slice(0, 1000)
  const events = formData.getAll('events').map(String).filter(isWebhookEvent)
  if (!name) return { error: 'nameRequired' }
  if (!isWebhookUrl(url)) return { error: 'urlInvalid' }
  if (events.length === 0) return { error: 'eventsRequired' }
  try {
    const row = await db.webhookEndpoint.create({ data: { name, url, events, secret: newWebhookSecret() }, select: { id: true } })
    await audit({ userId: admin.id, action: 'webhook.create', entity: 'WebhookEndpoint', entityId: row.id, newValue: `${name} → ${url}` })
  } catch {
    return { error: 'saveFailed' }
  }
  revalidatePath(PATH)
  return { ok: true }
}

/** Which events an endpoint receives. */
export async function setWebhookEvents(id: string, events: string[]): Promise<{ error?: string }> {
  const admin = await requireAdmin()
  const wanted = events.filter(isWebhookEvent)
  if (wanted.length === 0) return { error: 'eventsRequired' }
  await db.webhookEndpoint.update({ where: { id }, data: { events: wanted } })
  await audit({ userId: admin.id, action: 'webhook.events', entity: 'WebhookEndpoint', entityId: id, newValue: wanted.join(', ') })
  revalidatePath(PATH)
  return {}
}

/** A paused endpoint receives nothing new; what was already queued for it still goes out. */
export async function setWebhookActive(id: string, active: boolean): Promise<void> {
  const admin = await requireAdmin()
  await db.webhookEndpoint.update({ where: { id }, data: { active } })
  await audit({ userId: admin.id, action: active ? 'webhook.resume' : 'webhook.pause', entity: 'WebhookEndpoint', entityId: id })
  revalidatePath(PATH)
}

/** A new secret: the automation has to be given it before it checks the next signature. */
export async function rotateWebhookSecret(id: string): Promise<void> {
  const admin = await requireAdmin()
  await db.webhookEndpoint.update({ where: { id }, data: { secret: newWebhookSecret() } })
  await audit({ userId: admin.id, action: 'webhook.rotate', entity: 'WebhookEndpoint', entityId: id })
  revalidatePath(PATH)
}

export type DeleteState = { error?: string }

export async function deleteWebhook(id: string, _prev: DeleteState, _formData: FormData): Promise<DeleteState> {
  const admin = await requireAdmin()
  const row = await db.webhookEndpoint.findUnique({ where: { id }, select: { name: true } })
  if (!row) return { error: 'notFound' }
  await db.webhookEndpoint.delete({ where: { id } })
  await audit({ userId: admin.id, action: 'webhook.delete', entity: 'WebhookEndpoint', entityId: id, oldValue: row.name })
  revalidatePath(PATH)
  return {}
}

export async function testWebhook(id: string): Promise<AttemptResult> {
  await requireAdmin()
  const result = await sendTestEvent(id)
  revalidatePath(PATH)
  return result
}

export async function resendWebhookDelivery(id: string): Promise<AttemptResult> {
  await requireAdmin()
  const result = await resendDelivery(id)
  revalidatePath(PATH)
  return result
}
