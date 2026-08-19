'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { RotateCcw } from 'lucide-react'
import { reopenProject } from '../../schedule/actions'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'

/**
 * Undo a completion: status back, actual end cleared and the days that were
 * taken out of the plan on completion return to the schedule.
 */
export function ReopenButton({ projectId, projectLabel }: { projectId: string; projectLabel: string }) {
  const t = useTranslations('schedule')
  const tc = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={pending} className={btn.outlineSm}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        {t('reopenProject')}
      </button>
      <AlertDialog
        open={open}
        title={t('reopenProject')}
        description={t('reopenProjectConfirm', { project: projectLabel })}
        confirmLabel={t('reopenProject')}
        cancelLabel={tc('cancel')}
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false)
          startTransition(async () => {
            await reopenProject(projectId)
            router.refresh()
          })
        }}
      />
    </>
  )
}
