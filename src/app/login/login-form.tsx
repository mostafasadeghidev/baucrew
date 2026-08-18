'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { login, type LoginState } from './actions'
import { btn } from '@/components/ui/button'

export function LoginForm() {
  const t = useTranslations('auth')
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {})

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium">
          {t('username')}
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          {t('password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {t(state.error)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`${btn.primary} w-full`}
      >
        {t('login')}
      </button>
    </form>
  )
}
