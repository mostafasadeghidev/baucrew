'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const KEY = 'baucrew:nav'
const EVENT = 'baucrew:nav'
const MAX = 20

/** Path (with query) the user was on before the current page, or '' if unknown. */
export function readPreviousPath(currentPath: string): string {
  try {
    const stack: string[] = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].split('?')[0] !== currentPath) return stack[i]
    }
  } catch {
    // ignore
  }
  return ''
}

export function subscribeNav(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

/**
 * Records in-app navigation (client-side route changes don't update
 * document.referrer) so smart back links can return to the page the user
 * actually came from. Renders nothing.
 */
export function NavHistory() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  useEffect(() => {
    const qs = searchParams.toString()
    const full = qs ? `${pathname}?${qs}` : pathname
    try {
      const stack: string[] = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
      if (stack[stack.length - 1] !== full) {
        stack.push(full)
        while (stack.length > MAX) stack.shift()
        sessionStorage.setItem(KEY, JSON.stringify(stack))
        window.dispatchEvent(new Event(EVENT))
      }
    } catch {
      // ignore
    }
  }, [pathname, searchParams])
  return null
}
