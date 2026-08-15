'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createSession, verifyPassword } from '@/lib/auth'

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
})

// Best-effort in-memory throttle per username (per server instance).
const attempts = new Map<string, { count: number; firstAt: number }>()
const WINDOW_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 10

function isThrottled(key: string): boolean {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now })
    return false
  }
  entry.count += 1
  return entry.count > MAX_ATTEMPTS
}

export type LoginState = { error?: 'invalidCredentials' | 'tooManyAttempts' }

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: 'invalidCredentials' }

  const { username, password } = parsed.data
  if (isThrottled(username.toLowerCase())) return { error: 'tooManyAttempts' }

  const user = await db.user.findUnique({ where: { username } })
  // Always run a compare to keep timing consistent for unknown users
  const ok = await verifyPassword(
    password,
    user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvaliduuuuuuuuuuuuuuuuuuuuuuuuu'
  )
  if (!user || !user.active || !ok) return { error: 'invalidCredentials' }

  await createSession(user.id)
  redirect(user.role === 'EMPLOYEE' ? '/my' : '/dashboard')
}
