'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { btn } from '@/components/ui/button'
import { createWebhook, type WebhookFormState } from './actions'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

/** A new endpoint: a name, the address n8n gave for its webhook, and the events it wants — all of them to begin with. */
export function WebhookForm({ events }: { events: Array<{ value: string; label: string }> }) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<WebhookFormState, FormData>(createWebhook, {})
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) form.current?.reset()
  }, [state])

  const error =
    state.error === 'nameRequired'
      ? t('webhookErrorName')
      : state.error === 'urlInvalid'
        ? t('webhookErrorUrl')
        : state.error === 'eventsRequired'
          ? t('webhookErrorEvents')
          : state.error
            ? tc('saveFailed')
            : null

  return (
    <form ref={form} action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <label className="block text-sm">
          <span className="text-muted">{t('webhookName')}</span>
          <input name="name" required maxLength={120} className={inputClass} placeholder={t('webhookNamePlaceholder')} />
        </label>
        <label className="block text-sm">
          <span className="text-muted">{t('webhookUrl')}</span>
          <input name="url" required type="url" maxLength={1000} className={`${inputClass} font-mono`} placeholder="https://n8n.example/webhook/…" />
          <span className="mt-1 block text-xs text-muted">{t('webhookUrlHint')}</span>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm text-muted">{t('webhookEvents')}</legend>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
          {events.map((event) => (
            <label key={event.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="events" value={event.value} defaultChecked className="h-4 w-4 accent-[var(--accent)]" />
              {event.label}
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={btn.primary}>
        {t('webhookCreate')}
      </button>
    </form>
  )
}
