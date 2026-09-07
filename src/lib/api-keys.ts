// API keys: how a program outside the app proves who it is.
//
// A key is a long random string handed out once. The app keeps only its
// hash, the way it keeps session tokens, so a copy of the database gives
// nobody a working key. The first characters are kept in the clear so a
// person can tell keys apart in a list.

import { createHash, randomBytes } from 'node:crypto'

export const API_KEY_PREFIX = 'bc_'

/** How much of a key is shown in lists: the prefix and a few characters. */
const SHOWN_CHARS = API_KEY_PREFIX.length + 8

export const hashApiKey = (token: string): string => createHash('sha256').update(token).digest('hex')

export const keyPrefix = (token: string): string => token.slice(0, SHOWN_CHARS)

/** A fresh key: the token to hand out once, and what the database keeps. */
export function newApiKey(): { token: string; hash: string; prefix: string } {
  const token = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`
  return { token, hash: hashApiKey(token), prefix: keyPrefix(token) }
}

/** Whether a bearer token is one of ours at all, before any lookup. */
export const looksLikeApiKey = (token: string): boolean =>
  token.startsWith(API_KEY_PREFIX) && token.length >= SHOWN_CHARS + 16 && /^[A-Za-z0-9_-]+$/.test(token)

/** The token out of an Authorization header, or null when there is none. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return m ? m[1] : null
}
