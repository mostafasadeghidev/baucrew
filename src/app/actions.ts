'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { destroySession } from '@/lib/auth'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config'
import { HIDE_PRICES_COOKIE } from '@/lib/format'

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

/** Hides every price behind asterisks in this browser, or shows them again. */
export async function setPricesHidden(hidden: boolean) {
  const store = await cookies()
  if (hidden) {
    store.set(HIDE_PRICES_COOKIE, '1', { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  } else {
    store.delete(HIDE_PRICES_COOKIE)
  }
  revalidatePath('/', 'layout')
}
