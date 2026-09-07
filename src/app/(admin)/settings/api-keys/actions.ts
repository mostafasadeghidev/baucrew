'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { newApiKey } from '@/lib/api-keys'

export type KeyFormState = {
  error?: 'nameRequired' | 'userInvalid' | 'saveFailed'
  /** The key itself, shown once. */
  token?: string
  name?: string
}

/**
 * Makes a key for a program to act as one office user. The key is shown
 * once; the database keeps its hash. Crew accounts get no key — the API is
 * the office's door, not the crew's.
 */
export async function createApiKey(_prev: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const admin = await requireAdmin()
  const name = String(formData.get('name') ?? '').trim().slice(0, 120)
  const userId = String(formData.get('userId') ?? '')
  if (!name) return { error: 'nameRequired' }
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, active: true, username: true } })
  if (!user || !user.active || user.role === 'EMPLOYEE') return { error: 'userInvalid' }
  const key = newApiKey()
  try {
    const row = await db.apiKey.create({ data: { name, prefix: key.prefix, tokenHash: key.hash, userId: user.id } })
    await audit({
      userId: admin.id,
      action: 'apiKey.create',
      entity: 'ApiKey',
      entityId: row.id,
      newValue: `${name} (${user.username})`,
    })
  } catch {
    return { error: 'saveFailed' }
  }
  revalidatePath('/settings/api-keys')
  return { token: key.token, name }
}

export type RevokeState = { error?: string }

/** A revoked key opens nothing from now on; it stays in the list as a record. */
export async function revokeApiKey(id: string, _prev: RevokeState, _formData: FormData): Promise<RevokeState> {
  const admin = await requireAdmin()
  const row = await db.apiKey.findUnique({ where: { id }, select: { id: true, name: true, revokedAt: true } })
  if (!row) return { error: 'notFound' }
  if (!row.revokedAt) {
    await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } })
    await audit({ userId: admin.id, action: 'apiKey.revoke', entity: 'ApiKey', entityId: id, oldValue: row.name })
  }
  revalidatePath('/settings/api-keys')
  return {}
}
