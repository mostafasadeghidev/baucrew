'use client'

import { useActionState, type ReactNode } from 'react'
import { SavedToast } from './saved-toast'

export type SaveState = { savedAt?: number; error?: string }

/**
 * A <form> around a server action that returns `{ savedAt }` on success.
 * Shows a transient "Saved ✓" next to the children (place the submit button
 * last so the toast appears beside it). Optionally clears the inputs on success.
 */
export function SavedForm({
  action,
  id,
  className,
  children,
  resetOnSave = false,
  errorLabel,
}: {
  action: (formData: FormData) => Promise<SaveState>
  /** Lets buttons outside the form submit it via `form={id}`. */
  id?: string
  className?: string
  children: ReactNode
  resetOnSave?: boolean
  /** Maps an `error` code from the action to a translated message. */
  errorLabel?: (code: string) => string
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    async (_prev, formData) => action(formData),
    {}
  )
  return (
    <form
      id={id}
      action={formAction}
      className={className}
      key={resetOnSave ? state.savedAt ?? 0 : undefined}
      aria-busy={pending}
    >
      {children}
      <SavedToast trigger={state.savedAt} />
      {state.error && errorLabel && (
        <p role="alert" className="text-sm text-danger">
          {errorLabel(state.error)}
        </p>
      )}
    </form>
  )
}
