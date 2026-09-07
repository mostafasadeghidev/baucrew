import 'server-only'
import { db } from './db'
import { getCurrentUser, type CurrentUser } from './auth'
import { bearerToken, hashApiKey, looksLikeApiKey } from './api-keys'

/** Who is calling the API, and how they proved it. */
export type ApiIdentity = {
  user: CurrentUser
  via: 'key' | 'session'
  keyId: string | null
  keyName: string | null
}

/**
 * The caller of an API request: the user behind a bearer key, or — for the
 * app's own pages calling the API — the signed-in user. A key that was
 * revoked, or whose user was switched off, opens nothing.
 */
export async function authenticateApi(req: Request): Promise<ApiIdentity | null> {
  const token = bearerToken(req.headers.get('authorization'))
  if (token) {
    if (!looksLikeApiKey(token)) return null
    const key = await db.apiKey.findUnique({
      where: { tokenHash: hashApiKey(token) },
      include: { user: { include: { employee: true } } },
    })
    if (!key || key.revokedAt || !key.user.active) return null
    // "Last used" to the minute is enough, and spares a write per call.
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
    }
    return { user: key.user, via: 'key', keyId: key.id, keyName: key.name }
  }
  const user = await getCurrentUser()
  return user ? { user, via: 'session', keyId: null, keyName: null } : null
}
