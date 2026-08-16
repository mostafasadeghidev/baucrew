'use client'

import { useRouter } from 'next/navigation'
import { backLinkClass } from './back-link'

export function BackButton({ label }: { label: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={backLinkClass}
    >
      <span aria-hidden className="text-base leading-none">←</span>
      {label}
    </button>
  )
}
