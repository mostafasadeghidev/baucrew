'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { destroySession } from '@/lib/auth'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config'

export async function logout() {
  await destroySession()
  redirect('/login')
}

export async function setLocale(locale: string) {
  const value = isLocale(locale) ? locale : DEFAULT_LOCALE
  const store = await cookies()
  store.set('locale', value, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
}
