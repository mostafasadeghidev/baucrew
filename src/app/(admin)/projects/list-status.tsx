'use client'

/**
 * A project's status in the list: the badge is a menu, as on the project's own
 * page, and beside it one button takes the step a project usually takes next —
 * "Abgeschlossen" for a running job, "Abgerechnet" for a finished one. One
 * click; finishing a job asks first, as the board does, because it also writes
 * the day the work ended.
 */

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { QuickStatus } from '@/components/quick-status'
import { setProjectStatus } from './actions'

export function ListStatus({
  projectId,
  projectLabel,
  status,
  next,
  options,
  colorClass,
  confirmNext,
}: {
  projectId: string
  /** "2026-0048 — Musterhaus", for the question before a job is finished. */
  projectLabel: string
  status: string
  /** The usual next step and what it is called; null where there is none. */
  next: { value: string; label: string } | null
  options: Array<{ value: string; label: string }>
  colorClass: string
  /** True when the next step asks before it is taken. */
  confirmNext: boolean
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const [pending, startTransition] = useTransition()
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)

  const step = () => {
    if (!next) return
    setFailed(false)
    startTransition(async () => {
      const result = await setProjectStatus(projectId, next.value)
      if (result.error) setFailed(true)
    })
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <QuickStatus value={status} options={options} colorClass={colorClass} ariaLabel={t('status')} onChange={setProjectStatus.bind(null, projectId)} />
      {next && (
        <button
          type="button"
          disabled={pending}
          onClick={() => (confirmNext ? setAsking(true) : step())}
          title={t('listNextStep', { status: next.label })}
          aria-label={t('listNextStep', { status: next.label })}
          className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-700 disabled:opacity-50 dark:hover:text-emerald-400"
        >
          <Check className="h-3 w-3 shrink-0" aria-hidden />
          <span className="max-w-24 truncate">{next.label}</span>
        </button>
      )}
      {failed && (
        <span role="alert" className="text-xs text-danger">
          {tc('saveFailed')}
        </span>
      )}
      <AlertDialog
        open={asking}
        title={t('kanbanConfirmTitle')}
        description={next ? `${projectLabel} → ${next.label}. ${t('kanbanConfirmBody')}` : ''}
        confirmLabel={tc('confirm')}
        cancelLabel={tc('cancel')}
        pending={pending}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false)
          step()
        }}
      />
    </span>
  )
}
