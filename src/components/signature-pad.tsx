'use client'

/**
 * A place to sign with a finger, a pen or a mouse.
 *
 * One pointer at a time draws; a second finger resting on the glass is
 * ignored rather than joined to the line. The canvas is as sharp as the
 * screen (device pixels, not CSS pixels), the ground stays transparent so the
 * signature sits on the sheet like ink, and the strokes are joined with
 * quadratic curves through their midpoints — straight segments between the
 * points a phone reports look like a signature drawn with a ruler.
 *
 * `onChange` hands up a PNG data URL, or null while nothing is drawn.
 */

import { useEffect, useRef, useState } from 'react'

export function SignaturePad({
  onChange,
  clearLabel,
  hint,
  height = 180,
}: {
  onChange: (dataUrl: string | null) => void
  clearLabel: string
  /** Shown in the empty pad: "Hier unterschreiben". */
  hint: string
  height?: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef<{ id: number; last: { x: number; y: number }; mid: { x: number; y: number } } | null>(null)
  const inked = useRef(false)
  const [empty, setEmpty] = useState(true)

  // The canvas takes the size of its box in device pixels. It is sized once:
  // a resize would wipe what is drawn, and a signature box does not resize
  // under the hand that signs in it.
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    const box = el.getBoundingClientRect()
    el.width = Math.round(box.width * ratio)
    el.height = Math.round(box.height * ratio)
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawing.current) return
    e.preventDefault()
    // Kept to the pad while it is down, so a stroke that leaves the box is not
    // cut. A pointer that cannot be captured still draws.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // nothing to do
    }
    const p = point(e)
    drawing.current = { id: e.pointerId, last: p, mid: p }
    // A dot is a signature's full stop — and the only thing a tap leaves.
    const ctx = e.currentTarget.getContext('2d')
    if (ctx) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2)
      ctx.fillStyle = '#111827'
      ctx.fill()
    }
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = drawing.current
    if (!stroke || stroke.id !== e.pointerId) return
    e.preventDefault()
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const p = point(e)
    const mid = { x: (stroke.last.x + p.x) / 2, y: (stroke.last.y + p.y) / 2 }
    ctx.beginPath()
    ctx.moveTo(stroke.mid.x, stroke.mid.y)
    ctx.quadraticCurveTo(stroke.last.x, stroke.last.y, mid.x, mid.y)
    ctx.stroke()
    stroke.last = p
    stroke.mid = mid
    inked.current = true
  }

  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = drawing.current
    if (!stroke || stroke.id !== e.pointerId) return
    drawing.current = null
    if (!inked.current) return
    setEmpty(false)
    onChange(e.currentTarget.toDataURL('image/png'))
  }

  const clear = () => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.restore()
    inked.current = false
    drawing.current = null
    setEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <div className="relative rounded-lg border-2 border-dashed border-border bg-white">
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ height, touchAction: 'none' }}
          className="block w-full cursor-crosshair rounded-lg"
        />
        {empty && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">{hint}</p>
        )}
        <span aria-hidden className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-neutral-300" />
      </div>
      <div className="mt-1 flex justify-end">
        <button type="button" onClick={clear} disabled={empty} className="rounded-md px-2 py-1 text-xs text-muted hover:text-foreground disabled:opacity-40">
          {clearLabel}
        </button>
      </div>
    </div>
  )
}
