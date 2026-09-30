'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { markCardSeen } from '@/app/mentions-actions'

/**
 * Opening a card reads what it had to tell: its lines in the bell are seen,
 * and the red bell on its front goes out — the way a Trello card's does. Only
 * drawn while there is something unseen, so an ordinary opening costs nothing.
 */
export function CardSeen({ projectId }: { projectId: string }) {
  const router = useRouter()
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    void markCardSeen(projectId).then(() => router.refresh())
  }, [projectId, router])
  return null
}
