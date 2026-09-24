'use client'

/**
 * "Zeile anlegen": gives a job the planning sheet does not know a line of its
 * own — the month it starts in, its order value — so it counts in the month
 * the way the sheet's lines do. Offered wherever such a job is pointed out:
 * the Datenlücken card, a month card's "Nicht in der Tabelle", the
 * Planabgleich. The reason a line cannot be made is said in place.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { btn } from '@/components/ui/button'
import { createPlanLine } from './actions'

const WHY: Record<string, string> = { noDate: 'lineNoDate', noValue: 'lineNoValue', hasLine: 'lineHasLine' }

export function CreateLineButton({ projectId, tiny = false }: { projectId: string; tiny?: boolean }) {
  const t = useTranslations('planMatch')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createPlanLine(projectId)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }
        className={
          tiny
            ? 'rounded border border-border px-1.5 py-0 text-[11px] font-medium text-accent hover:bg-subtle disabled:opacity-50'
            : `${btn.outlineSm} text-xs`
        }
      >
        {t('createLine')}
      </button>
      {error && <span className="text-[11px] text-red-600 dark:text-red-400">{t(WHY[error] ?? 'lineFailed')}</span>}
    </span>
  )
}
