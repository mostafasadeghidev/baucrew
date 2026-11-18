'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Image as ImageIcon,
  ListTodo,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  MoveUpRight,
  PenLine,
  RotateCcw,
  X,
} from 'lucide-react'
import { submitFeedback } from '@/app/feedback-actions'
import { TARGET_PARAM, withCommentParam, type FeedbackAnchor, type FeedbackStatus } from '@/lib/feedback'
import { describeEnvironment, deviceClass, selectorFor } from '@/lib/feedback-page'
import { btn } from '@/components/ui/button'
import { canvasToJpeg, captureViewport, imageFromFile, prepareCapture, type ImageBlob } from './capture'
import { DrawingEditor, type DrawTool } from './drawing-editor'
import { ghostXs, launcher, toolbarButton, toolbarDivider, toolbarShell } from './toolbar-styles'

type Pin = { id: string; number: number; title: string; status: FeedbackStatus; anchor: FeedbackAnchor | null }
type PlacedPin = Pin & { element: Element }

type Draft = {
  anchor: FeedbackAnchor | null
  element: Element | null
  base: HTMLCanvasElement | null
  screenshot: ImageBlob | null
  /** What the screenshot shows: the marked spot, the drawings, or nothing (failed). */
  shot: 'marked' | 'plain' | 'drawn' | 'failed' | 'pending'
  targetOutside: boolean
  upload: (ImageBlob & { name: string }) | null
  metadata: Record<string, unknown>
}

const Z = 'z-[2147483500]'

function environment() {
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[]; platform?: string } }
  const hints = { brands: nav.userAgentData?.brands ?? [], platform: nav.userAgentData?.platform ?? navigator.platform, touchPoints: navigator.maxTouchPoints }
  return {
    ...describeEnvironment(navigator.userAgent, hints),
    device: deviceClass(navigator.userAgent, navigator.maxTouchPoints),
    userAgent: navigator.userAgent,
    viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
    screen: { width: screen.width, height: screen.height },
    pixelRatio: window.devicePixelRatio,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
    capturedAt: new Date().toISOString(),
  }
}

function describeElement(element: Element): string {
  const text = (element as HTMLElement).innerText?.trim()
  return (text || element.getAttribute('alt') || element.getAttribute('aria-label') || element.tagName.toLowerCase()).replace(/\s+/g, ' ').slice(0, 700)
}

const isOurs = (event: Event) => event.composedPath().some((n) => n instanceof Element && n.hasAttribute('data-feedback-ui'))

/** The open items on this page whose element is still there to pin them to. */
async function fetchPins(): Promise<PlacedPin[]> {
  try {
    const response = await fetch(`/api/feedback/pins?page=${encodeURIComponent(location.pathname)}`)
    if (!response.ok) return []
    const data = (await response.json()) as { pins: Pin[] }
    const placed: PlacedPin[] = []
    for (const pin of data.pins) {
      if (!pin.anchor?.selector) continue
      try {
        const element = document.querySelector(pin.anchor.selector)
        if (element) placed.push({ ...pin, element })
      } catch {
        // A selector of an older layout that is no longer valid CSS.
      }
    }
    return placed
  } catch {
    // Pins are a help, never a reason to stop commenting.
    return []
  }
}

/**
 * The comment tools at the foot of every page in comment mode: Comment (pick
 * an element), Arrow and Draw (take the screenshot, mark it up), then the
 * form above the bar. The author is whoever is logged in.
 */
export default function CommentToolbar({
  name,
  tasksHref,
  onExit,
  localCopy = null,
}: {
  name: string
  tasksHref: string
  onExit: () => void
  /**
   * Set when this app is not the live site: comments here stay on this copy
   * and never reach the list agents and the client work from. `liveUrl` is
   * the live site, when known, to comment there instead.
   */
  localCopy?: { liveUrl: string | null } | null
}) {
  const t = useTranslations('feedback.mode')
  const tErr = useTranslations('feedback.errors')
  const [minimized, setMinimized] = useState(false)
  const [picking, setPicking] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editor, setEditor] = useState<DrawTool | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')
  const [sent, setSent] = useState<number | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState<(() => void) | null>(null)
  const [pins, setPins] = useState<PlacedPin[]>([])
  const [openPin, setOpenPin] = useState<PlacedPin | null>(null)
  const [, setTick] = useState(0)
  const outlineRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Capture code and fonts download while the person is still looking.
  useEffect(() => {
    const warm = () => void prepareCapture().catch(() => {})
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warm, { timeout: 1500 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(warm, 300)
    return () => clearTimeout(id)
  }, [])

  const showOutline = useCallback((element: Element | null) => {
    const box = outlineRef.current
    if (!box) return
    if (!element) {
      box.hidden = true
      return
    }
    const r = element.getBoundingClientRect()
    Object.assign(box.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` })
    box.hidden = false
  }, [])

  const loadPins = useCallback(() => {
    void fetchPins().then(setPins)
  }, [])

  useEffect(() => {
    let current = true
    void fetchPins().then((found) => current && setPins(found))
    return () => {
      current = false
    }
  }, [])

  // Pins follow their elements as the page scrolls and changes size.
  useEffect(() => {
    if (!pins.length) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setTick((n) => n + 1))
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(document.body)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
    }
  }, [pins.length])

  // An "open the page" link from the dashboard names the element to show.
  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get(TARGET_PARAM)
    if (!wanted) return
    let element: Element | null = null
    try {
      element = document.querySelector(wanted)
    } catch {
      return
    }
    if (!element) return
    element.scrollIntoView({ block: 'center' })
    const show = setTimeout(() => showOutline(element), 400)
    const hide = setTimeout(() => showOutline(null), 5000)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [showOutline])

  const capture = useCallback(
    async (element: Element | null, anchor: FeedbackAnchor | null) => {
      setCapturing(true)
      setStatus('')
      const metadata: Record<string, unknown> = environment()
      const previousCursor = document.documentElement.style.cursor
      document.documentElement.style.cursor = 'progress'
      try {
        // Two frames: the outline and the hint are gone from the page first.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const result = await captureViewport({ element, anchor, label: t('marker') })
        const screenshot = await canvasToJpeg(result.canvas)
        metadata.capture = result.metrics
        metadata.target = result.target
        return {
          anchor,
          element,
          base: result.canvas,
          screenshot,
          shot: result.target ? 'marked' : 'plain',
          targetOutside: !!anchor?.selector && !result.target,
          upload: null,
          metadata,
        } satisfies Draft
      } catch (error) {
        console.warn('Feedback screenshot failed:', error)
        metadata.screenshot = 'capture failed'
        return { anchor, element, base: null, screenshot: null, shot: 'failed', targetOutside: false, upload: null, metadata } satisfies Draft
      } finally {
        document.documentElement.style.cursor = previousCursor
        setCapturing(false)
      }
    },
    [t]
  )

  const start = useCallback(
    async (element: Element | null, point: { x: number; y: number } | null, tool: DrawTool | null) => {
      setPicking(false)
      showOutline(null)
      setOpenPin(null)
      setFormOpen(false)
      let anchor: FeedbackAnchor | null = null
      if (element && point) {
        const r = element.getBoundingClientRect()
        anchor = {
          selector: selectorFor(element as never, document.body as never, CSS.escape),
          text: describeElement(element),
          x: r.width ? (point.x - r.left) / r.width : 0,
          y: r.height ? (point.y - r.top) / r.height : 0,
        }
      }
      const next = await capture(element, anchor)
      setDraft((old) => ({ ...next, upload: old?.upload ?? null }))
      if (tool && next.base) setEditor(tool)
      else {
        setFormOpen(true)
        requestAnimationFrame(() => textareaRef.current?.focus())
      }
    },
    [capture, showOutline]
  )

  /** A new comment while one is half written asks first. */
  const begin = useCallback(
    (go: () => void) => {
      if (capturing || sending) return
      if (comment.trim() || draft?.upload) {
        setConfirmDiscard(() => () => {
          setComment('')
          setDraft(null)
          go()
        })
        return
      }
      setDraft(null)
      go()
    },
    [capturing, sending, comment, draft]
  )

  // Picking: the page's own clicks are held back until the element is chosen.
  useEffect(() => {
    if (!picking) return
    const onMove = (e: PointerEvent) => {
      if (!isOurs(e)) showOutline(e.target as Element)
    }
    const block = (e: Event) => {
      if (isOurs(e)) return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    const onClick = (e: MouseEvent) => {
      if (isOurs(e)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      void start(e.target as Element, { x: e.clientX, y: e.clientY }, null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPicking(false)
        showOutline(null)
      }
    }
    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerdown', block, true)
    document.addEventListener('mousedown', block, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey)
    document.documentElement.style.cursor = 'crosshair'
    return () => {
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('pointerdown', block, true)
      document.removeEventListener('mousedown', block, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.cursor = ''
    }
  }, [picking, start, showOutline])

  useEffect(() => {
    if (!formOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editor) setFormOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [formOpen, editor])

  useEffect(() => {
    if (sent == null) return
    const id = setTimeout(() => setSent(null), 6000)
    return () => clearTimeout(id)
  }, [sent])

  async function retake() {
    if (!draft || capturing) return
    const next = await capture(draft.element, draft.anchor)
    setDraft((old) => ({ ...next, upload: old?.upload ?? null }))
  }

  async function attach(file: File | undefined) {
    if (!file) return
    setStatus('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setStatus(tErr('badImage'))
      return
    }
    try {
      const image = await imageFromFile(file)
      setDraft((d) => (d ? { ...d, upload: { ...image, name: file.name.replace(/\.[^.]+$/, '').slice(0, 100) + '.jpg' } } : d))
    } catch {
      setStatus(tErr('badImage'))
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!draft || sending || capturing || !comment.trim()) return
    setSending(true)
    setStatus(t('sending'))
    const form = new FormData()
    form.set('comment', comment)
    form.set('page', location.pathname + location.search)
    if (draft.anchor) form.set('anchor', JSON.stringify(draft.anchor))
    form.set('metadata', JSON.stringify({ ...draft.metadata, screenshot: draft.shot, annotated: draft.shot === 'drawn' }))
    if (draft.screenshot) {
      form.set('screenshot', new File([draft.screenshot.blob], draft.shot === 'drawn' ? 'Screenshot mit Zeichnung.jpg' : 'Screenshot.jpg', { type: 'image/jpeg' }))
      form.set('screenshotWidth', String(draft.screenshot.width))
      form.set('screenshotHeight', String(draft.screenshot.height))
    }
    if (draft.upload) {
      form.set('upload', new File([draft.upload.blob], draft.upload.name, { type: 'image/jpeg' }))
      form.set('uploadWidth', String(draft.upload.width))
      form.set('uploadHeight', String(draft.upload.height))
    }
    try {
      const result = await submitFeedback(form)
      if (result.error) {
        setStatus(tErr(result.error))
        return
      }
      setComment('')
      setDraft(null)
      setFormOpen(false)
      setStatus('')
      setSent(result.number ?? null)
      loadPins()
    } catch {
      setStatus(tErr('generic'))
    } finally {
      setSending(false)
    }
  }

  const shotLabel =
    draft?.shot === 'failed'
      ? t('screenshotFailed')
      : draft?.shot === 'drawn'
        ? t('withDrawings')
        : draft?.shot === 'marked'
          ? t('targetMarked')
          : t('screenshotIncluded')

  const busy = capturing || sending

  return createPortal(
    <div data-feedback-ui className={`pointer-events-none fixed inset-0 ${Z} print:hidden`}>
      <div ref={outlineRef} hidden className="pointer-events-none fixed rounded-[3px] bg-accent/10 outline-2 outline-offset-1 outline-accent [outline-style:solid]" />

      {!minimized &&
        !picking &&
        pins.map((pin) => {
          const r = pin.element.getBoundingClientRect()
          if (!r.width || !r.height || r.bottom < 0 || r.top > window.innerHeight) return null
          const left = Math.min(window.innerWidth - 16, Math.max(16, r.left + r.width * (pin.anchor?.x ?? 0)))
          const top = r.top + r.height * (pin.anchor?.y ?? 0)
          return (
            <button
              key={pin.id}
              type="button"
              onClick={() => setOpenPin(openPin?.id === pin.id ? null : pin)}
              aria-label={t('pin', { number: pin.number, title: pin.title })}
              title={t('pin', { number: pin.number, title: pin.title })}
              style={{ left, top }}
              className="pointer-events-auto absolute flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full rounded-bl-none bg-danger px-1.5 text-[11px] font-semibold tabular-nums text-white shadow-lg ring-2 ring-white transition-transform hover:scale-110"
            >
              {pin.number}
            </button>
          )
        })}

      {/* Behind the drawing editor the bar would only show through its shade. */}
      <div className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] ${editor ? 'invisible' : ''}`}>
        {openPin && !formOpen && (
          <div className="pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-surface p-4 text-foreground shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">
                <span className="mr-1.5 tabular-nums text-muted">#{openPin.number}</span>
                {openPin.title}
              </p>
              <button type="button" onClick={() => setOpenPin(null)} aria-label={t('closeForm')} className="-mr-1 -mt-1 rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="mt-3">
              <Link href={`${tasksHref}?item=${openPin.number}`} className={btn.outlineSm}>
                {t('openSent')}
              </Link>
            </div>
          </div>
        )}

        {formOpen && draft && (
          <form
            onSubmit={send}
            aria-label={t('formTitle')}
            className="pointer-events-auto flex max-h-[calc(100dvh-7rem)] w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-foreground shadow-xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{t('formTitle')}</h2>
              <button type="button" onClick={() => setFormOpen(false)} aria-label={t('closeForm')} title={t('closeForm')} className="-mr-1 rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="line-clamp-2 rounded-lg bg-subtle px-3 py-2 text-xs text-muted">{draft.anchor?.text || t('wholePage')}</p>
            <div className="space-y-1.5">
              <label htmlFor="feedback-comment" className="text-sm font-medium">
                {t('commentLabel')}
              </label>
              <textarea
                id="feedback-comment"
                ref={textareaRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={4000}
                rows={4}
                required
                placeholder={t('commentPlaceholder')}
                className="block w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="rounded-xl border border-border">
              {draft.screenshot && (
                // eslint-disable-next-line @next/next/no-img-element -- a local blob, nothing for next/image to do
                <img src={draft.screenshot.url} alt={shotLabel} className="max-h-44 w-full rounded-t-xl border-b border-border object-cover object-top" />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-xs font-medium text-muted">{capturing ? t('capturing') : shotLabel}</span>
                <span className="flex items-center gap-1">
                  <button type="button" disabled={busy || !draft.base} onClick={() => setEditor('arrow')} className={ghostXs}>
                    <PenLine className="h-3.5 w-3.5" aria-hidden />
                    {t('annotate')}
                  </button>
                  <button type="button" disabled={busy} onClick={retake} className={ghostXs}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    {t('retake')}
                  </button>
                </span>
              </div>
            </div>
            {draft.shot === 'failed' && <p className="text-xs text-danger">{t('captureFailedHint')}</p>}
            {draft.targetOutside && <p className="text-xs text-danger">{t('targetOutside')}</p>}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void attach(e.target.files?.[0])} />
              {draft.upload ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob */}
                  <img src={draft.upload.url} alt="" className="h-9 w-12 rounded-md border border-border object-cover" />
                  <span className="min-w-0 flex-1 truncate text-muted">{draft.upload.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((d) => (d ? { ...d, upload: null } : d))
                      if (fileRef.current) fileRef.current.value = ''
                    }}
                    className={ghostXs}
                  >
                    {t('removeAttachment')}
                  </button>
                </>
              ) : (
                <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={ghostXs} title={t('attachTypes')}>
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                  {t('attachImage')}
                </button>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted">{t('privacy')}</p>
            {status && (
              <p role="status" aria-live="polite" className={`text-xs ${sending ? 'text-muted' : 'text-danger'}`}>
                {status}
              </p>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="truncate text-xs text-muted">{t('sendAs', { name })}</span>
              <button type="submit" disabled={busy || !comment.trim()} className={btn.primarySm}>
                {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {t('send')}
              </button>
            </div>
          </form>
        )}

        {confirmDiscard && (
          <div role="alertdialog" aria-label={t('discardDraft')} className="pointer-events-auto flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-3 rounded-2xl border border-border bg-surface p-4 text-foreground shadow-xl">
            <p className="text-sm">{t('discardDraft')}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDiscard(null)} className={btn.outlineSm}>
                {t('keep')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const go = confirmDiscard
                  setConfirmDiscard(null)
                  go()
                }}
                className={btn.dangerSm}
              >
                {t('discard')}
              </button>
            </div>
          </div>
        )}

        {picking && (
          <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-full bg-foreground py-1.5 pl-4 pr-1.5 text-sm text-background shadow-xl">
            {t('pickHint')}
            <button type="button" onClick={() => (setPicking(false), showOutline(null))} className={toolbarButton(false)}>
              {t('cancel')}
            </button>
          </div>
        )}
        {capturing && (
          <div role="status" className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-xl">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t('capturing')}
          </div>
        )}
        {sent != null && !formOpen && (
          <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-full bg-foreground py-1.5 pl-4 pr-1.5 text-sm text-background shadow-xl">
            {t('sent', { number: sent })}
            <Link href={`${tasksHref}?item=${sent}`} className={toolbarButton(true)}>
              {t('openSent')}
            </Link>
          </div>
        )}

        {localCopy && !minimized && (
          <div role="note" className="pointer-events-auto flex max-w-full items-center gap-2 rounded-xl bg-amber-100 px-3 py-1.5 text-xs sm:rounded-full sm:py-1 text-amber-900 shadow-sm dark:bg-amber-500/20 dark:text-amber-100">
            <span>{t('localCopy')}</span>
            {localCopy.liveUrl && (
              <a
                href={`${localCopy.liveUrl}${withCommentParam(window.location.pathname + window.location.search)}`}
                className="shrink-0 font-medium underline underline-offset-2"
              >
                {t('localCopyGoLive')}
              </a>
            )}
          </div>
        )}
        {minimized ? (
          <button type="button" onClick={() => setMinimized(false)} title={t('expandTip')} className={launcher}>
            <MessageSquarePlus className="h-4 w-4" aria-hidden />
            <span className="text-sm font-medium">{t('expand')}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-background/10">
              <Maximize2 className="h-4 w-4" aria-hidden />
            </span>
          </button>
        ) : (
          <div role="toolbar" aria-label={t('toolbar')} className={toolbarShell}>
            <span aria-hidden title={name} className="ml-1 mr-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/15 text-[11px] font-semibold uppercase sm:flex">
              {name.slice(0, 2)}
            </span>
            <button
              type="button"
              disabled={busy}
              aria-pressed={picking}
              title={t('commentTip')}
              onClick={() => (picking ? (setPicking(false), showOutline(null)) : begin(() => (setFormOpen(false), setPicking(true))))}
              className={toolbarButton(picking, !picking)}
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
              <span>{t('comment')}</span>
            </button>
            <button type="button" disabled={busy} title={t('arrowTip')} onClick={() => begin(() => void start(null, null, 'arrow'))} className={toolbarButton(false)}>
              <MoveUpRight className="h-4 w-4" aria-hidden />
              <span>{t('arrow')}</span>
            </button>
            <button type="button" disabled={busy} title={t('drawTip')} onClick={() => begin(() => void start(null, null, 'pen'))} className={toolbarButton(false)}>
              <PenLine className="h-4 w-4" aria-hidden />
              <span>{t('draw')}</span>
            </button>
            <span aria-hidden className={toolbarDivider} />
            <Link href={tasksHref} title={t('tasksTip')} className={toolbarButton(false)}>
              <ListTodo className="h-4 w-4" aria-hidden />
              <span>{t('tasks')}</span>
            </Link>
            <button type="button" onClick={() => (setMinimized(true), setPicking(false), showOutline(null), setFormOpen(false))} aria-label={t('minimize')} title={t('minimize')} className={toolbarButton(false)}>
              <Minimize2 className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={onExit} aria-label={t('exit')} title={t('exit')} className={toolbarButton(false)}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {editor && draft?.base && (
        <DrawingEditor
          source={draft.base}
          initialTool={editor}
          onCancel={() => {
            setEditor(null)
            setFormOpen(true)
          }}
          onDone={async (canvas, marks) => {
            setEditor(null)
            try {
              const screenshot = await canvasToJpeg(canvas)
              setDraft((d) => (d ? { ...d, screenshot, shot: marks ? 'drawn' : d.shot === 'drawn' ? 'plain' : d.shot } : d))
            } catch {
              setStatus(tErr('generic'))
            }
            setFormOpen(true)
            requestAnimationFrame(() => textareaRef.current?.focus())
          }}
        />
      )}
    </div>,
    document.body
  )
}
