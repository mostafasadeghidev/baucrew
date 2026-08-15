'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Keeps the wall-mounted board current without any interaction. */
export function AutoRefresh({ intervalMs = 60000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(timer)
  }, [router, intervalMs])
  return null
}
