'use client'

import { useActionState } from 'react'
import { btn } from '@/components/ui/button'

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
  const [state, formAction, pending] = useActionState<DeleteState, FormData>(action, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault()
      }}
      className="inline-flex flex-col items-end gap-1"
    >
      <button
        type="submit"
        disabled={pending}
        className={btn.dangerSm}
      >
        {label}
      </button>
      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {errorLabels[state.error] ?? state.error}
        </p>
      )}
    </form>
  )
}
