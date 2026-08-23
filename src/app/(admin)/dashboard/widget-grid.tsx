'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { saveDashboardOrder } from './actions'

export type GridItem = {
  id: string
  width: 'full' | 'half'
  /** Rendered on the server — the card itself, with its edit bar in edit mode. */
  node: ReactNode
}

/**
 * The dashboard grid. Outside the edit mode it is plain markup; inside it the
 * cards can be dragged onto each other with the mouse. Touch devices use the
 * ↑ ↓ buttons of the card instead — HTML5 drag & drop does not work there.
 */
export function WidgetGrid({ items, editing }: { items: GridItem[]; editing: boolean }) {
  const [order, setOrder] = useState(() => items.map((i) => i.id))
  // Ref, not state: dragenter can fire in the same tick as dragstart, before
  // React has re-rendered with the new handlers.
  const source = useRef<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const changed = useRef(false)

  const byId = new Map(items.map((i) => [i.id, i]))
  const sorted = order.map((id) => byId.get(id)).filter((i): i is GridItem => i !== undefined)

  function onDragEnter(overId: string) {
    const from = source.current
    if (!from || from === overId) return
    setOrder((current) => {
      const next = [...current]
      const fromIndex = next.indexOf(from)
      const toIndex = next.indexOf(overId)
      if (fromIndex === -1 || toIndex === -1) return current
      next.splice(toIndex, 0, ...next.splice(fromIndex, 1))
      changed.current = true
      return next
    })
  }

  function finishDrag() {
    source.current = null
    setDragging(null)
    if (!changed.current) return
    changed.current = false
    startTransition(() => {
      void saveDashboardOrder(order)
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sorted.map((item) => (
        <div
          key={item.id}
          className={`grid ${item.width === 'full' ? 'lg:col-span-2' : ''} ${
            editing ? 'cursor-grab active:cursor-grabbing' : ''
          } ${dragging === item.id ? 'opacity-40' : ''}`}
          draggable={editing}
          onDragStart={() => {
            source.current = item.id
            setDragging(item.id)
            changed.current = false
          }}
          onDragEnter={() => onDragEnter(item.id)}
          onDragOver={(e) => {
            if (editing) e.preventDefault()
          }}
          onDragEnd={finishDrag}
          onDrop={(e) => {
            e.preventDefault()
            finishDrag()
          }}
        >
          {item.node}
        </div>
      ))}
    </div>
  )
}
