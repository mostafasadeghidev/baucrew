'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { syncTrelloNowAction } from './actions'
import type { TrelloSyncOutcome } from '@/lib/trello/auto-sync'

/** Runs the sync at once — every board switched on, or one board — and says what came of it. */
export function TrelloSyncButton({ boardId, small = false }: { boardId?: string; small?: boolean }) {
  const t = useTranslations('trelloSync')
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<TrelloSyncOutcome | null>(null)

  function run() {
    setOutcome(null)
    startTransition(async () => {
      setOutcome(await syncTrelloNowAction(boardId))
    })
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${small ? 'text-xs' : ''}`}>
      <button type="button" onClick={run} disabled={pending} className={`${small ? btn.ghost : btn.primary} disabled:opacity-60`}>
        <RefreshCw className={`mr-1.5 inline h-4 w-4 ${pending ? 'animate-spin' : ''}`} aria-hidden />
        {pending ? t('syncing') : boardId ? t('syncThis') : t('syncNow')}
      </button>
      {outcome && outcome.error && <span className="text-sm text-red-700 dark:text-red-400">{t(`error_${outcome.error}`)}</span>}
      {outcome && !outcome.error && (
        <span className="text-sm text-muted">
          {t('result', { boards: outcome.boards.filter((b) => b.ok).length, failed: outcome.boards.filter((b) => !b.ok).length, files: outcome.files.fetched, pending: outcome.files.pending })}
        </span>
      )}
    </div>
  )
}
