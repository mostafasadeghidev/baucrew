'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { btn } from '@/components/ui/button'
import type { AttemptResult } from '@/lib/webhooks'
import {
  resendWebhookDelivery,
  rotateWebhookSecret,
  setWebhookActive,
  setWebhookEvents,
  testWebhook,
} from './actions'

/** What an attempt came back with, in a line. */
function useAttemptText() {
  const t = useTranslations('settings')
  return (result: AttemptResult) =>
    result.ok
      ? t('webhookTestOk', { status: result.status ?? 200 })
      : t('webhookTestFailed', { error: result.error ?? (result.status ? `HTTP ${result.status}` : '—') })
}

/** Send a test, pause or resume, and the secret — shown on demand, copied with a click, renewed on purpose. */
export function EndpointControls({ id, active, secret }: { id: string; active: boolean; secret: string }) {
  const t = useTranslations('settings')
  const text = useAttemptText()
  const [pending, start] = useTransition()
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btn.outlineSm}
          disabled={pending}
          onClick={() => start(async () => setResult(await testWebhook(id)))}
        >
          {t('webhookTest')}
        </button>
        <button type="button" className={btn.outlineSm} disabled={pending} onClick={() => start(() => setWebhookActive(id, !active))}>
          {active ? t('webhookPause') : t('webhookResume')}
        </button>
        {result && (
          <span role="status" className={`text-xs ${result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-danger'}`}>
            {text(result)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">{t('webhookSecret')}</span>
        <code className="select-all break-all rounded-md border border-border bg-background px-2 py-1 font-mono">
          {shown ? secret : '•'.repeat(24)}
        </code>
        <button type="button" className={btn.outlineSm} onClick={() => setShown((v) => !v)}>
          {shown ? t('webhookSecretHide') : t('webhookSecretShow')}
        </button>
        <button
          type="button"
          className={btn.outlineSm}
          onClick={() => navigator.clipboard?.writeText(secret).then(() => setCopied(true))}
        >
          {copied ? t('keyCopied') : t('keyCopy')}
        </button>
        {confirmRotate ? (
          <>
            <span className="text-muted">{t('webhookRotateConfirm')}</span>
            <button
              type="button"
              className={btn.dangerSm}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await rotateWebhookSecret(id)
                  setConfirmRotate(false)
                  setCopied(false)
                })
              }
            >
              {t('webhookRotate')}
            </button>
            <button type="button" className={btn.outlineSm} onClick={() => setConfirmRotate(false)}>
              {t('webhookCancel')}
            </button>
          </>
        ) : (
          <button type="button" className={btn.outlineSm} onClick={() => setConfirmRotate(true)}>
            {t('webhookRotate')}
          </button>
        )}
      </div>
    </div>
  )
}

/** The events an endpoint receives, changed by ticking them. */
export function EndpointEvents({
  id,
  selected,
  events,
}: {
  id: string
  selected: string[]
  events: Array<{ value: string; label: string }>
}) {
  const t = useTranslations('settings')
  const [pending, start] = useTransition()
  const [error, setError] = useState(false)
  const toggle = (value: string, on: boolean) => {
    const next = on ? [...new Set([...selected, value])] : selected.filter((e) => e !== value)
    start(async () => setError(Boolean((await setWebhookEvents(id, next)).error)))
  }
  return (
    <div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {events.map((event) => (
          <label key={event.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(event.value)}
              disabled={pending}
              onChange={(e) => toggle(event.value, e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {event.label}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{t('webhookErrorEvents')}</p>}
    </div>
  )
}

/** Sends one delivery again now, and says how it went. */
export function ResendButton({ id }: { id: string }) {
  const t = useTranslations('settings')
  const text = useAttemptText()
  const [pending, start] = useTransition()
  const [result, setResult] = useState<AttemptResult | null>(null)
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" className={btn.outlineSm} disabled={pending} onClick={() => start(async () => setResult(await resendWebhookDelivery(id)))}>
        {t('webhookResend')}
      </button>
      {result && !result.ok && <span className="max-w-60 truncate text-[11px] text-danger">{text(result)}</span>}
    </span>
  )
}
