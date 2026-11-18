'use client'

import { planViewportCapture, screenshotTarget, type ScreenshotTarget } from '@/lib/feedback-page'

/**
 * The screenshot of comment mode: the viewport as it is, drawn from the page's
 * own elements by html-to-image, loaded only when somebody comments. What is
 * off screen is kept as empty boxes (planViewportCapture), so a long page does
 * not have to be rebuilt for one window's worth of it. Password fields,
 * elements marked `data-private` and the comment tools themselves are left out.
 */

const MARK = '#d92d20'
const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
/** The longest edge of a stored picture, in pixels. */
export const MAX_EDGE = 1800

let library: Promise<typeof import('html-to-image')> | null = null
let fontCSS: Promise<string> | null = null

const loadLibrary = () =>
  (library ||= import('html-to-image').catch((error) => {
    library = null
    throw error
  }))

/** The app's own fonts as embedded CSS, worked out once. A page without them still captures, in the fallback font. */
const fonts = () =>
  (fontCSS ||= loadLibrary()
    .then(({ getFontEmbedCSS }) => getFontEmbedCSS(document.body))
    .catch(() => ''))

/** Starts the downloads while somebody is still choosing what to comment on. */
export function prepareCapture() {
  return Promise.all([loadLibrary(), fonts()])
}

/** The picked element's box and the click, baked into the picture. */
export function markTarget(canvas: HTMLCanvasElement, target: ScreenshotTarget | null, label: string) {
  if (!target) return
  const { width, height } = target.viewport
  const b = target.bounds
  const x = target.point.x * width
  const y = target.point.y * height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.scale(canvas.width / width, canvas.height / height)
  ctx.fillStyle = 'rgba(217,45,32,.08)'
  ctx.fillRect(b.x * width, b.y * height, b.width * width, b.height * height)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 4
  ctx.strokeRect(b.x * width, b.y * height, b.width * width, b.height * height)
  ctx.strokeStyle = MARK
  ctx.lineWidth = 2
  ctx.strokeRect(b.x * width, b.y * height, b.width * width, b.height * height)
  ctx.beginPath()
  ctx.arc(x, y, 9, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fillStyle = MARK
  ctx.fill()
  ctx.font = '600 12px Inter, system-ui, sans-serif'
  const labelWidth = Math.ceil(ctx.measureText(label).width) + 20
  const labelHeight = 24
  const lx = Math.max(2, Math.min(width - labelWidth - 2, x + 14))
  const ly = y >= 40 ? y - 34 : Math.min(height - labelHeight - 2, y + 14)
  ctx.fillStyle = MARK
  ctx.beginPath()
  ctx.roundRect(lx, ly, labelWidth, labelHeight, 6)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, lx + labelWidth / 2, ly + labelHeight / 2)
  ctx.restore()
}

export type Capture = {
  canvas: HTMLCanvasElement
  target: ScreenshotTarget | null
  metrics: { durationMs: number; sourceElements: number; retainedElements: number }
}

export async function captureViewport({
  element,
  anchor,
  label,
}: {
  element: Element | null
  anchor: { x: number; y: number } | null
  label: string
}): Promise<Capture> {
  const started = performance.now()
  const [{ toCanvas }, fontEmbedCSS] = await prepareCapture()
  const width = document.documentElement.clientWidth
  const height = window.innerHeight
  const target = element?.isConnected ? screenshotTarget(element.getBoundingClientRect(), anchor, { width, height }) : null
  const elements = [...document.querySelectorAll('body *')]
  const plan = planViewportCapture(elements, document.documentElement, { width, height }, (node) => getComputedStyle(node).display)

  // Off-screen pictures keep their place in the layout without being embedded.
  const restore: (() => void)[] = []
  for (const image of document.querySelectorAll('img')) {
    const r = image.getBoundingClientRect()
    if (r.bottom >= 0 && r.top <= height && r.width && r.height) continue
    const own = Object.getOwnPropertyDescriptor(image, 'cloneNode')
    const cloneNode = image.cloneNode
    image.cloneNode = function (deep?: boolean) {
      const clone = cloneNode.call(this, deep) as HTMLImageElement
      clone.removeAttribute('srcset')
      clone.src = TRANSPARENT
      return clone
    }
    restore.push(() => {
      if (own) Object.defineProperty(image, 'cloneNode', own)
      else delete (image as { cloneNode?: unknown }).cloneNode
    })
  }
  try {
    const canvas = await toCanvas(document.documentElement, {
      width,
      height,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5, MAX_EDGE / Math.max(width, height)),
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
      fontEmbedCSS: fontEmbedCSS || undefined,
      skipFonts: !fontEmbedCSS,
      imagePlaceholder: TRANSPARENT,
      cacheBust: false,
      style: {
        transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
        transformOrigin: 'top left',
        height: `${document.documentElement.scrollHeight}px`,
      },
      filter: (node) => {
        if (node instanceof Element && node.matches('[data-feedback-ui], input[type=password], [data-private], script, noscript'))
          return false
        return plan.include(node)
      },
    })
    markTarget(canvas, target, label)
    return {
      canvas,
      target,
      metrics: {
        durationMs: Math.round(performance.now() - started),
        sourceElements: elements.length,
        retainedElements: plan.retainedElements,
      },
    }
  } finally {
    restore.forEach((reset) => reset())
  }
}

export type ImageBlob = { blob: Blob; width: number; height: number; url: string }

/** A canvas as a JPEG small enough to send, trying lower qualities until it is. */
export async function canvasToJpeg(canvas: HTMLCanvasElement, maxBytes = 1_500_000): Promise<ImageBlob> {
  for (const quality of [0.85, 0.7, 0.5, 0.35]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && (blob.size <= maxBytes || quality === 0.35))
      return { blob, width: canvas.width, height: canvas.height, url: URL.createObjectURL(blob) }
  }
  throw new Error('encode')
}

/** A picture chosen from the device, scaled to the stored size and turned into a JPEG. */
export async function imageFromFile(file: File): Promise<ImageBlob> {
  const bitmap = await createImageBitmap(file)
  const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvasToJpeg(canvas)
}
