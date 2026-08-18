'use client'

import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { btn } from './button'

/**
 * Confirmation dialog in the spirit of shadcn/ui's alert-dialog — replaces the
 * browser `confirm()` for destructive or final actions (delete, complete
 * project). Renders in a portal, closes on Escape and on the backdrop.
 */
export function AlertDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  // Client-only render (portal target); no setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" aria-label={cancelLabel} onClick={onCancel} className="absolute inset-0 bg-black/50" />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <div className="mt-2 text-sm text-muted">{description}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className={btn.outline}>
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            disabled={pending}
            onClick={onConfirm}
            className={
              destructive
                ? `${btn.primary} bg-danger text-white hover:bg-danger/90`
                : btn.primary
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
