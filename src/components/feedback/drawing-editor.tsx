'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Check, MoveUpRight, PenLine, Trash2, Undo2, X } from 'lucide-react'
import { toolbarButton, toolbarDivider, toolbarShell } from './toolbar-styles'

export type DrawTool = 'arrow' | 'pen'
type Point = { x: number; y: number }
type Shape = { tool: DrawTool; points: Point[] }

const INK = '#d92d20'

/**
 * Draw on the screenshot: arrows from where the press started to where it
 * ended, or a free line. The marks are painted into the picture itself, so
 * whoever opens it later sees them, in the dashboard and in a download alike.
 */
export function DrawingEditor({
  source,
  initialTool,
  onDone,
  onCancel,
}: {
  source: HTMLCanvasElement
  initialTool: DrawTool
  onDone: (canvas: HTMLCanvasElement, marks: number) => void
  onCancel: () => void
}) {
  const t = useTranslations('feedback.mode')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<DrawTool>(initialTool)
  const [shapes, setShapes] = useState<Shape[]>([])
  const active = useRef<Shape | null>(null)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(source, 0, 0)
    ctx.strokeStyle = INK
    ctx.fillStyle = INK
    ctx.lineWidth = Math.max(3, canvas.width / 420)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const shape of [...shapes, ...(active.current ? [active.current] : [])]) {
      const points = shape.points
      if (points.length < 2) continue
      const first = points[0]
      const last = points[points.length - 1]
      ctx.beginPath()
      ctx.moveTo(first.x, first.y)
      for (const p of shape.tool === 'arrow' ? [last] : points.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
      if (shape.tool === 'arrow') {
        const angle = Math.atan2(last.y - first.y, last.x - first.x)
        const size = ctx.lineWidth * 5
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(last.x - size * Math.cos(angle - Math.PI / 6), last.y - size * Math.sin(angle - Math.PI / 6))
        ctx.lineTo(last.x - size * Math.cos(angle + Math.PI / 6), last.y - size * Math.sin(angle + Math.PI / 6))
        ctx.closePath()
        ctx.fill()
      }
    }
  }, [source, shapes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = source.width
    canvas.height = source.height
    render()
  }, [source, render])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        setShapes((s) => s.slice(0, -1))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) * canvas.width) / rect.width, y: ((e.clientY - rect.top) * canvas.height) / rect.height }
  }

  return createPortal(
    <div
      data-feedback-ui
      role="dialog"
      aria-modal="true"
      aria-label={t('drawingLabel')}
      className="fixed inset-0 z-[2147483600] flex flex-col items-center gap-3 bg-black/80 p-3 sm:p-6"
    >
      <p className="text-center text-sm text-white/80" role="status">
        {t('drawHint')}
      </p>
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <canvas
          ref={canvasRef}
          aria-label={t('drawingLabel')}
          className="max-h-full max-w-full cursor-crosshair touch-none rounded-lg bg-white shadow-2xl"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            active.current = { tool, points: [point(e)] }
          }}
          onPointerMove={(e) => {
            const shape = active.current
            if (!shape) return
            if (shape.tool === 'arrow') shape.points[1] = point(e)
            else if (shape.points.length < 10000) shape.points.push(point(e))
            render()
          }}
          onPointerUp={(e) => {
            const shape = active.current
            if (!shape) return
            shape.points.push(point(e))
            active.current = null
            setShapes((s) => [...s, shape])
          }}
          onPointerCancel={() => {
            active.current = null
            render()
          }}
        />
      </div>
      <div role="toolbar" aria-label={t('drawingLabel')} className={toolbarShell}>
        <button type="button" aria-pressed={tool === 'arrow'} onClick={() => setTool('arrow')} className={toolbarButton(tool === 'arrow')}>
          <MoveUpRight className="h-4 w-4" aria-hidden />
          <span>{t('arrowTool')}</span>
        </button>
        <button type="button" aria-pressed={tool === 'pen'} onClick={() => setTool('pen')} className={toolbarButton(tool === 'pen')}>
          <PenLine className="h-4 w-4" aria-hidden />
          <span>{t('penTool')}</span>
        </button>
        <span aria-hidden className={toolbarDivider} />
        <button
          type="button"
          disabled={!shapes.length}
          onClick={() => setShapes((s) => s.slice(0, -1))}
          className={toolbarButton(false)}
          aria-label={t('undo')}
          title={t('undo')}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled={!shapes.length}
          onClick={() => setShapes([])}
          className={toolbarButton(false)}
          aria-label={t('clear')}
          title={t('clear')}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
        <span aria-hidden className={toolbarDivider} />
        <button type="button" onClick={onCancel} className={toolbarButton(false)} aria-label={t('cancel')} title={t('cancel')}>
          <X className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current
            if (canvas) onDone(canvas, shapes.length)
          }}
          className={toolbarButton(true, true)}
        >
          <Check className="h-4 w-4" aria-hidden />
          <span>{t('done')}</span>
        </button>
      </div>
    </div>,
    document.body
  )
}
