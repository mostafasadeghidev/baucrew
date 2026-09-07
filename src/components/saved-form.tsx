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
  errorText,
}: {
  action: (formData: FormData) => Promise<SaveState>
  /** Lets buttons outside the form submit it via `form={id}`. */
  id?: string
  className?: string
  children: ReactNode
  resetOnSave?: boolean
  /**
   * Maps an `error` code from the action to a translated message. Only from
   * a client component — a function cannot cross into one from the server.
   */
  errorLabel?: (code: string) => string
  /** One message for every error, for a form on a server-rendered page. */
  errorText?: string
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
      {state.error && (errorLabel || errorText) && (
        <p role="alert" className="text-sm text-danger">
          {errorLabel ? errorLabel(state.error) : errorText}
        </p>
      )}
    </form>
  )
}
