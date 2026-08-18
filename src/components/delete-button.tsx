'use client'

import { useActionState, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertDialog } from './ui/alert-dialog'
import { btn } from './ui/button'

type DeleteState = { error?: string }

export function DeleteButton({
  action,
  label,
  confirmMessage,
  errorLabels = {},
}: {
  action: (prev: DeleteState, formData: FormData) => Promise<DeleteState>
  label: string
  confirmMessage: string
  /** Maps error keys returned by the action to translated texts. */
  errorLabels?: Record<string, string>
}) {
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<DeleteState, FormData>(action, {})
  const [confirming, setConfirming] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form ref={formRef} action={formAction} className="inline-flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={btn.dangerSm}>
        {label}
      </button>
      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {errorLabels[state.error] ?? state.error}
        </p>
      )}
      <AlertDialog
        open={confirming}
        title={label}
        description={confirmMessage}
        confirmLabel={label}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          formRef.current?.requestSubmit()
        }}
      />
    </form>
  )
}
