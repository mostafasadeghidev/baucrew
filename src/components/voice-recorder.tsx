'use client'

/**
 * A voice note recorded in the browser — the phone on the site, mostly. One
 * button starts, the same stops; what was said can be heard back before it is
 * sent or thrown away. MediaRecorder records in whatever the browser knows
 * (webm/opus where it can, mp4 on older Safari — see `pickRecordingType`), and a
 * note stops by itself at the limit. Nothing leaves the phone until "Senden".
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Mic, Send, Square, Trash2 } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { DOC_MAX_RECORDING_SECONDS, formatDuration, pickRecordingType } from '@/lib/documentation'

type Take = { blob: Blob; url: string; durationMs: number }

export function VoiceRecorder({
  onSend,
  onCancel,
  sending,
  large = false,
  transcriptionReady,
}: {
  onSend: (take: { blob: Blob; durationMs: number }) => void
  onCancel: () => void
  sending: boolean
  large?: boolean
  /** Whether the server can write the note out; the privacy line is shown only then. */
  transcriptionReady: boolean
}) {
  const t = useTranslations('documentation')
  const tc = useTranslations('common')
  const [state, setState] = useState<'idle' | 'recording' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [take, setTake] = useState<Take | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const startedAt = useRef(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const release = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }

  // Leaving the window while recording lets go of the microphone; a take not sent is freed.
  useEffect(() => () => release(), [])
  useEffect(() => () => (take ? URL.revokeObjectURL(take.url) : undefined), [take])

  const stop = () => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }

  const start = async () => {
    setError(null)
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(t('voiceUnsupported'))
      return
    }
    const type = pickRecordingType((candidate) => MediaRecorder.isTypeSupported(candidate))
    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError(t('voiceDenied'))
      return
    }
    stream.current = media
    const rec = type ? new MediaRecorder(media, { mimeType: type }) : new MediaRecorder(media)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    rec.onstop = () => {
      const durationMs = Date.now() - startedAt.current
      release()
      const blob = new Blob(chunks, {
        type: rec.mimeType || type || 'audio/webm',
      })
      if (blob.size === 0) {
        setState('idle')
        setError(t('voiceEmpty'))
        return
      }
      setTake({ blob, url: URL.createObjectURL(blob), durationMs })
      setState('done')
    }
    recorder.current = rec
    startedAt.current = Date.now()
    setElapsed(0)
    // In slices, so a long note is not one buffer that only arrives at the end.
    rec.start(1000)
    setState('recording')
    timer.current = setInterval(() => {
      const ms = Date.now() - startedAt.current
      setElapsed(ms)
      if (ms >= DOC_MAX_RECORDING_SECONDS * 1000) stop()
    }, 250)
  }

  const discard = () => {
    setTake(null)
    setState('idle')
    setElapsed(0)
  }

  const size = large ? 'h-16 w-16' : 'h-12 w-12'
  return (
    <div className="space-y-3">
      {state !== 'done' ? (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={state === 'recording' ? stop : start}
            aria-label={state === 'recording' ? t('voiceStop') : t('voiceStart')}
            className={`${size} flex shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95 ${
              state === 'recording' ? 'bg-danger' : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            {state === 'recording' ? <Square className="h-5 w-5 fill-current" aria-hidden /> : <Mic className="h-6 w-6" aria-hidden />}
          </button>
          <div className="min-w-0">
            <p className={`font-semibold tabular-nums ${large ? 'text-2xl' : 'text-lg'}`} aria-live="polite">
              {formatDuration(elapsed)}
              <span className="ml-1.5 text-sm font-normal text-muted">/ {formatDuration(DOC_MAX_RECORDING_SECONDS * 1000)}</span>
            </p>
            <p className="text-sm text-muted">{state === 'recording' ? t('voiceRecording') : t('voiceTapToStart')}</p>
          </div>
        </div>
      ) : (
        take && (
          <div className="space-y-3">
            <audio controls src={take.url} className="w-full" preload="metadata" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => onSend({ blob: take.blob, durationMs: take.durationMs })}
                className={large ? btn.primary : btn.primarySm}
              >
                <Send className="h-4 w-4" aria-hidden />
                {sending ? (transcriptionReady ? t('voiceSendingTranscribing') : t('sending')) : t('voiceSend')}
              </button>
              <button type="button" disabled={sending} onClick={discard} className={large ? btn.outline : btn.outlineSm}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('voiceDiscard')}
              </button>
            </div>
          </div>
        )
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">{transcriptionReady ? t('voicePrivacy') : t('transcriptionOffHint')}</p>
      {state === 'idle' && !take && (
        <button type="button" onClick={onCancel} className={btn.ghost}>
          {tc('cancel')}
        </button>
      )}
    </div>
  )
}
