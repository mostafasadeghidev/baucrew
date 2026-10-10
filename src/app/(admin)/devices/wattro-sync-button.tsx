'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { syncWattroDevicesAction } from './wattro-actions'
import type { WattroSyncFailure, WattroSyncOutcome } from '@/lib/wattro/assets'

const ERROR_KEYS = {
  notConfigured: 'wattroNotConfigured',
  auth: 'wattroErrorAuth',
  lookups: 'wattroErrorLookups',
  rateLimit: 'wattroErrorRateLimit',
  network: 'wattroErrorNetwork',
  upstream: 'wattroErrorUpstream',
  response: 'wattroErrorResponse',
  database: 'wattroErrorDatabase',
} as const satisfies Record<WattroSyncFailure, string>

/**
 * The one control that talks to Wattro, and only by reading: it pulls the
 * machines into the page. Office-only (the page itself is already gated);
 * when the server has no API key the button stays away and says why.
 */
export function WattroSyncButton({ configured }: { configured: boolean }) {
  const t = useTranslations('devices')
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<WattroSyncOutcome | null>(null)

  if (!configured) {
    return <p className="text-xs text-muted">{t('wattroNotConfigured')}</p>
  }

  function run() {
    setOutcome(null)
    startTransition(async () => {
      setOutcome(await syncWattroDevicesAction())
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" onClick={run} disabled={pending} className={`${btn.ghost} disabled:opacity-60`}>
        <RefreshCw className={`mr-1.5 inline h-4 w-4 ${pending ? 'animate-spin' : ''}`} aria-hidden />
        {pending ? t('wattroSyncing') : t('wattroSync')}
      </button>
      {outcome && !outcome.ok && (
        <span className="text-sm text-red-700 dark:text-red-400">
          {t(ERROR_KEYS[outcome.error])}
        </span>
      )}
      {outcome && outcome.ok && (
        <span className="text-sm text-muted">
          {t('wattroResult', {
            created: outcome.counts.created,
            adopted: outcome.counts.adopted,
            updated: outcome.counts.updated,
            unchanged: outcome.counts.unchanged,
            deactivated: outcome.counts.deactivated,
          })}
          {outcome.counts.conflictCount > 0 && (
            <> {t('wattroConflicts', { count: outcome.counts.conflictCount })}</>
          )}
          {outcome.counts.invalid > 0 && <> {t('wattroInvalid', { count: outcome.counts.invalid })}</>}
        </span>
      )}
    </div>
  )
}
