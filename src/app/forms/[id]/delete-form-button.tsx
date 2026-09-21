'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2 } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'
import { deleteForm } from '@/app/form-actions'

/** Takes the form away — the office only. A signed sheet stays on the project as its PDF. */
export function DeleteFormButton({ formId, title, back, signed }: { formId: string; title: string; back: string; signed: boolean }) {
  const t = useTranslations('forms')
  const tc = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${btn.outlineSm} gap-1.5 text-muted hover:text-danger`}>
        <Trash2 className="h-4 w-4" aria-hidden />
        {tc('delete')}
      </button>
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {tc('saveFailed')}
        </p>
      )}
      <AlertDialog
        open={open}
        title={t('deleteTitle')}
        description={signed ? t('deleteBodySigned', { title }) : t('deleteBody', { title })}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await deleteForm(formId)
            setOpen(false)
            if (result.error) return setFailed(true)
            router.push(back)
          })
        }
      />
    </>
  )
}
