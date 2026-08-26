'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Play, Square } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { formatMinutes } from '@/lib/time-entries'
import { startMyTime, stopMyTime } from './actions'

/**
 * Start/stop button on an assignment card. While running on this project it
 * shows the elapsed time and stops; otherwise it starts (closing whatever
 * else was still running).
 */
export function TimeClock({
  projectId,
  runningSince,
}: {
  projectId: string
  /** ISO timestamp when the open interval on THIS project started; null = not running here. */
  runningSince: string | null
}) {
  const t = useTranslations('time')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)

  // Tick once a minute so the elapsed label stays honest while the app is open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!runningSince) return
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [runningSince])

  const elapsed = runningSince
    ? formatMinutes(Math.max(0, Math.round((now - new Date(runningSince).getTime()) / 60000)))
    : null

  function act() {
    setError(false)
    startTransition(async () => {
      const res = runningSince ? await stopMyTime() : await startMyTime(projectId)
      if (res.error) setError(true)
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={act}
        disabled={pending}
        className={`${runningSince ? btn.primary : btn.outline} w-full justify-center gap-2 disabled:opacity-60`}
      >
        {runningSince ? (
          <>
            <Square className="h-5 w-5" aria-hidden />
            {t('stop')} · {elapsed}
          </>
        ) : (
          <>
            <Play className="h-5 w-5" aria-hidden />
            {t('start')}
          </>
        )}
      </button>
      {error && <p className="mt-1 text-center text-xs text-red-700 dark:text-red-400">{t('failed')}</p>}
    </div>
  )
}
