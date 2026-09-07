'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Select } from '@/components/ui/select'
import { btn } from '@/components/ui/button'
import { createApiKey, type KeyFormState } from './actions'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

/** Makes a key and shows it the one time it can be seen. */
export function KeyForm({ users }: { users: Array<{ value: string; label: string }> }) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<KeyFormState, FormData>(createApiKey, {})
  const [copied, setCopied] = useState(false)

  if (state.token) {
    return (
      <div className="space-y-3 rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-4">
        <p className="text-sm font-medium">{t('keyCreated', { name: state.name ?? '' })}</p>
        <p className="text-xs text-muted">{t('keyCopyHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="select-all break-all rounded-md border border-border bg-background px-2 py-1 text-sm">{state.token}</code>
          <button
            type="button"
            className={btn.outlineSm}
            onClick={() => {
              navigator.clipboard?.writeText(state.token ?? '').then(() => setCopied(true))
            }}
          >
            {copied ? t('keyCopied') : t('keyCopy')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-muted">{t('keyName')}</span>
          <input name="name" required maxLength={120} className={inputClass} placeholder={t('keyNamePlaceholder')} />
        </label>
        <label className="block text-sm">
          <span className="text-muted">{t('keyUser')}</span>
          <div className="mt-1">
            <Select name="userId" className="w-full" defaultValue={users[0]?.value ?? ''}>
              {users.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </div>
          <span className="mt-1 block text-xs text-muted">{t('keyUserHint')}</span>
        </label>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === 'nameRequired' ? t('keyNameRequired') : state.error === 'userInvalid' ? t('keyUserInvalid') : tc('saveFailed')}
        </p>
      )}
      <button type="submit" disabled={pending} className={btn.primary}>
        {t('createKey')}
      </button>
    </form>
  )
}
