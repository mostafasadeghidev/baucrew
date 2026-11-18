'use client'

import { useTranslations } from 'next-intl'
import type { FeedbackStatus, WaitingOn } from '@/lib/feedback'

/** One colour per status, the same in the list, the board's column heads and the drawer. */
export const STATUS_DOT: Record<FeedbackStatus, string> = {
  INBOX: 'bg-sky-500',
  TODO: 'bg-neutral-400',
  DECISION: 'bg-amber-500',
  IN_PROGRESS: 'bg-violet-500',
  DONE: 'bg-emerald-500',
  CLOSED: 'bg-neutral-300 dark:bg-neutral-600',
}

export const STATUS_PILL: Record<FeedbackStatus, string> = {
  INBOX: 'bg-sky-500/12 text-sky-800 dark:text-sky-300',
  TODO: 'bg-neutral-500/12 text-neutral-700 dark:text-neutral-300',
  DECISION: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  IN_PROGRESS: 'bg-violet-500/12 text-violet-800 dark:text-violet-300',
  DONE: 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300',
  CLOSED: 'bg-neutral-500/10 text-muted',
}

export function StatusPill({ status }: { status: FeedbackStatus }) {
  const t = useTranslations('feedback.status')
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium ${STATUS_PILL[status]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {t(status)}
    </span>
  )
}

export function WaitingChip({ waitingOn }: { waitingOn: WaitingOn }) {
  const t = useTranslations('feedback.waitingOn')
  return (
    <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border border-border px-2 text-xs text-muted">
      {t('label')}: <span className="ml-1 font-medium text-foreground">{t(waitingOn)}</span>
    </span>
  )
}
