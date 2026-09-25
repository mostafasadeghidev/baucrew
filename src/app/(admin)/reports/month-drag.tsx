'use client'

/**
 * Dragging a project's line from one month of the Planumsatz into another.
 * `DragLine` is a line as it can be picked up, `DropMonth` a month as it takes
 * one — the browser's own drag and drop, which is what the office has on its
 * desks; on a phone the month is set in the project form. A drop asks the
 * server to move the project and reads the page afresh, and the months' sums
 * come back changed.
 */

import { useState, useTransition, type DragEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { moveProjectMonth } from './month-actions'

const MIME = 'application/x-baucrew-project'

const carries = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(MIME)

export function DragLine({
  projectId,
  month,
  enabled,
  title,
  children,
}: {
  projectId: string
  /** The month (0–11) the line stands in — a drop on the same month is nothing. */
  month: number
  enabled: boolean
  title?: string
  children: ReactNode
}) {
  if (!enabled) return <>{children}</>
  return (
    <div
      draggable
      title={title}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME, JSON.stringify({ projectId, month }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  )
}

export function DropMonth({
  year,
  month,
  className,
  children,
}: {
  year: number
  /** 0–11 */
  month: number
  className: string
  children: ReactNode
}) {
  const t = useTranslations('reports')
  const router = useRouter()
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div
      className={`relative ${className} ${over ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : ''} ${pending ? 'opacity-60' : ''}`}
      onDragOver={(e) => {
        if (!carries(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!over) setOver(true)
      }}
      onDragLeave={(e) => {
        // Leaving for one of the month's own children is not leaving the month.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setOver(false)
      }}
      onDrop={(e) => {
        if (!carries(e)) return
        e.preventDefault()
        setOver(false)
        const data = JSON.parse(e.dataTransfer.getData(MIME)) as { projectId: string; month: number }
        if (data.month === month) return
        setError(null)
        startTransition(async () => {
          const result = await moveProjectMonth(data.projectId, year, month)
          if (result.error) setError(t('moveFailed'))
          else router.refresh()
        })
      }}
    >
      {children}
      {error && (
        <p className="pointer-events-none absolute inset-x-2 bottom-1 rounded bg-surface px-2 py-1 text-xs text-red-600 shadow dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
