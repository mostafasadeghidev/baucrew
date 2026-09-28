'use client'

/**
 * Keeps a page level with what others do, the way Trello's board is: every
 * few seconds, while the page is in front, it asks the server for a small
 * fingerprint of the data, and draws the page again only when that changed.
 * What is being typed, dragged or opened stays as it is — a redraw keeps the
 * page's own state.
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export function LiveRefresh({ url, every = 6000 }: { url: string; every?: number }) {
  const router = useRouter()
  const last = useRef<string | null>(null)

  useEffect(() => {
    let stopped = false
    let asking = false
    const check = async () => {
      if (asking || document.visibilityState !== 'visible') return
      asking = true
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (res.ok) {
          const { v } = (await res.json()) as { v?: string }
          if (typeof v === 'string') {
            if (last.current !== null && v !== last.current && !stopped) router.refresh()
            last.current = v
          }
        }
      } catch {
        // Offline for a moment: the next turn asks again.
      } finally {
        asking = false
      }
    }
    void check()
    const timer = setInterval(() => void check(), every)
    const onShow = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('focus', onShow)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('focus', onShow)
    }
  }, [router, url, every])

  return null
}
