'use client'

import { useRouter } from 'next/navigation'

export function BackButton({ label }: { label: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="text-sm text-muted hover:text-foreground"
    >
      ← {label}
    </button>
  )
}
