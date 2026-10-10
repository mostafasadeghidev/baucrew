'use client'
import { btn } from '@/components/ui/button'

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`${btn.outlineSm} print:hidden`}
    >
      {label}
    </button>
  )
}
