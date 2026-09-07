import { describe, expect, it } from 'vitest'
import { bearerToken, hashApiKey, keyPrefix, looksLikeApiKey, newApiKey } from '@/lib/api-keys'

describe('API keys', () => {
  it('makes a long random key with a recognisable prefix', () => {
    const a = newApiKey()
    const b = newApiKey()
    expect(a.token.startsWith('bc_')).toBe(true)
    expect(a.token.length).toBeGreaterThan(40)
    expect(a.token).not.toBe(b.token)
    expect(looksLikeApiKey(a.token)).toBe(true)
  })

  it('keeps a hash that the key reproduces and a prefix a person can read', () => {
    const { token, hash, prefix } = newApiKey()
    expect(hash).toBe(hashApiKey(token))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(prefix).toBe(keyPrefix(token))
    expect(token.startsWith(prefix)).toBe(true)
    expect(prefix.length).toBe(11)
  })

  it('tells a key from a session token or garbage', () => {
    expect(looksLikeApiKey('bc_short')).toBe(false)
    expect(looksLikeApiKey('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH')).toBe(false)
    expect(looksLikeApiKey('bc_with spaces and $ signs that are not base64url at all')).toBe(false)
  })

  it('reads the token out of an Authorization header', () => {
    expect(bearerToken('Bearer bc_abc')).toBe('bc_abc')
    expect(bearerToken('bearer   bc_abc ')).toBe('bc_abc')
    expect(bearerToken('Basic dXNlcjpwdw==')).toBeNull()
    expect(bearerToken(null)).toBeNull()
  })
})
