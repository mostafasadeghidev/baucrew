'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { addMyTime } from './actions'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-base focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

/**
 * "I forgot to press start": the worker adds a booking for that day by hand.
 * Only shown for days the app still accepts (today and the last week), and the
 * office sees the entry marked as added later.
 */
export function TimeLate({ projectId, date }: { projectId: string; date: string }) {
  const t = useTranslations('time')
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('07:00')
  const [to, setTo] = useState('16:00')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await addMyTime({ projectId, date, from, to })
      if (res.error) {
        setError(res.error)
        return
      }
      setDone(true)
      setOpen(false)
    })
  }

  if (done) {
    return <p className="text-center text-sm text-emerald-700 dark:text-emerald-400">{t('lateSaved')}</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${btn.outline} w-full justify-center gap-2`}
      >
        <Plus className="h-5 w-5" aria-hidden />
        {t('lateAdd')}
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          {t('from')}
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          {t('to')}
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </label>
      </div>
      {error && (
        <p className="text-sm text-red-700 dark:text-red-400">
          {error === 'invalidRange'
            ? t('invalidRange')
            : error === 'outOfRange'
              ? t('lateTooOld')
              : t('failed')}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={`${btn.primary} flex-1 justify-center disabled:opacity-60`}
        >
          {t('add')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btn.outline}>
          {t('lateCancel')}
        </button>
      </div>
    </div>
  )
}
