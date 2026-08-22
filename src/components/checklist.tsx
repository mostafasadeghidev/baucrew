'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Circle, Plus, TriangleAlert, X } from 'lucide-react'
import {
  addChecklistItem,
  removeChecklistItem,
  setChecklistItem,
} from '@/app/(admin)/projects/[id]/checklist-actions'
import { btn } from './ui/button'

export type ChecklistItemRow = {
  id: string
  text: string
  ok: boolean | null
  note: string | null
  checkedBy: string | null
  checkedAt: string | null
}

export type ChecklistRow = {
  id: string
  name: string
  items: ChecklistItemRow[]
}

/**
 * One checklist, tickable on phone and desktop: open → in order → problem.
 * A problem can carry a short note ("Vorgewerk nicht fertig"). Used on the
 * project page and in "Mein Bereich" on site.
 */
export function Checklist({
  checklist,
  canAddItems = true,
  canRemoveItems = false,
  compact = false,
}: {
  checklist: ChecklistRow
  canAddItems?: boolean
  /** Office view may delete lines; on site only ticking. */
  canRemoveItems?: boolean
  compact?: boolean
}) {
  const t = useTranslations('checklists')
  const tc = useTranslations('common')
  const [pending, startTransition] = useTransition()
  const [local, setLocal] = useState<Record<string, boolean | null>>({})
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [newText, setNewText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stateOf = (item: ChecklistItemRow) => (item.id in local ? local[item.id] : item.ok)
  const done = checklist.items.filter((i) => stateOf(i) !== null).length
  const problems = checklist.items.filter((i) => stateOf(i) === false).length

  function cycle(item: ChecklistItemRow) {
    const current = stateOf(item)
    const next = current === null ? true : current === true ? false : null
    setLocal((prev) => ({ ...prev, [item.id]: next }))
    setError(null)
    startTransition(async () => {
      const res = await setChecklistItem(item.id, { ok: next })
      if (res.error) {
        setLocal((prev) => ({ ...prev, [item.id]: item.ok }))
        setError(res.error === 'notAllowed' ? t('notAllowed') : tc('saveFailed'))
      } else if (next === false) {
        setNoteFor(item.id)
        setNoteText(item.note ?? '')
      }
    })
  }

  function saveNote(itemId: string) {
    const value = noteText
    setNoteFor(null)
    startTransition(async () => {
      await setChecklistItem(itemId, { ok: false, note: value })
    })
  }

  return (
    <div className={compact ? '' : 'rounded-lg border border-border bg-surface shadow-sm'}>
      <div className={`flex flex-wrap items-baseline justify-between gap-2 ${compact ? 'pb-2' : 'border-b border-border px-4 py-3'}`}>
        <p className="text-sm font-semibold">{checklist.name}</p>
        <p className="text-xs text-muted">
          {t('progress', { done, total: checklist.items.length })}
          {problems > 0 && (
            <span className="ml-2 font-medium text-amber-700 dark:text-amber-400">
              {t('problems', { count: problems })}
            </span>
          )}
        </p>
      </div>

      <ul className={compact ? 'space-y-1.5' : 'divide-y divide-border'}>
        {checklist.items.map((item) => {
          const state = stateOf(item)
          return (
            <li key={item.id} className={compact ? '' : 'px-4 py-2'}>
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => cycle(item)}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-70 ${
                    state === true
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                      : state === false
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                        : 'border-border bg-background'
                  }`}
                >
                  <span aria-hidden className="shrink-0">
                    {state === true ? (
                      <Check className="h-5 w-5" />
                    ) : state === false ? (
                      <TriangleAlert className="h-5 w-5" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.text}</span>
                    {item.note && <span className="block text-xs opacity-80">{item.note}</span>}
                    {item.checkedBy && item.checkedAt && (
                      <span className="block text-[11px] text-muted">
                        {t('checkedBy', { name: item.checkedBy, date: item.checkedAt })}
                      </span>
                    )}
                  </span>
                </button>
                {canRemoveItems && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(async () => void (await removeChecklistItem(item.id)))}
                    title={tc('delete')}
                    aria-label={tc('delete')}
                    className="mt-1 rounded-md border border-border p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>

              {noteFor === item.id && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <input
                    value={noteText}
                    autoFocus
                    placeholder={t('notePlaceholder')}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        saveNote(item.id)
                      }
                    }}
                    className="min-w-48 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button type="button" onClick={() => saveNote(item.id)} className={btn.primarySm}>
                    {tc('save')}
                  </button>
                </div>
              )}
            </li>
          )
        })}
        {checklist.items.length === 0 && (
          <li className={`text-sm text-muted ${compact ? '' : 'px-4 py-3'}`}>{t('empty')}</li>
        )}
      </ul>

      {canAddItems && (
        <div className={`flex flex-wrap items-center gap-2 ${compact ? 'mt-2' : 'border-t border-border px-4 py-3'}`}>
          <input
            value={newText}
            placeholder={t('addItemPlaceholder')}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newText.trim()) {
                e.preventDefault()
                const value = newText
                setNewText('')
                startTransition(async () => void (await addChecklistItem(checklist.id, value)))
              }
            }}
            className="min-w-48 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            disabled={pending || !newText.trim()}
            onClick={() => {
              const value = newText
              setNewText('')
              startTransition(async () => void (await addChecklistItem(checklist.id, value)))
            }}
            className={btn.outlineSm}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('addItem')}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className={`text-sm text-danger ${compact ? 'mt-1' : 'px-4 pb-3'}`}>
          {error}
        </p>
      )}
    </div>
  )
}
