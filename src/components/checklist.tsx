'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Circle, Clock, EyeOff, MoreHorizontal, Plus, SquareArrowOutUpRight, Trash2, TriangleAlert, UserPlus, X } from 'lucide-react'
import {
  addChecklistItem,
  removeChecklistItem,
  setChecklistItem,
  setChecklistItemPlan,
} from '@/app/(admin)/projects/[id]/checklist-actions'
import { convertChecklistItemToCard } from '@/app/(admin)/projects/actions'
import { btn } from './ui/button'
import { Menu, MenuSeparator, menuItemClass } from './ui/menu'
import { Popover, PopoverHead } from './ui/popover'
import { PERSON_SWATCH } from './swatches'

export type CheckPerson = { id: string; name: string; initials: string; swatch: number }

export type ChecklistItemRow = {
  id: string
  text: string
  ok: boolean | null
  note: string | null
  checkedBy: string | null
  checkedAt: string | null
  /** Trello's person on an item: who is to see to it. */
  assignee?: CheckPerson | null
  /** The day it is due by, "YYYY-MM-DD", and as the reader writes it; whether it is past. */
  due?: string | null
  dueLabel?: string | null
  dueLate?: boolean
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
 *
 * As in Trello a bar shows how far it is ticked and the ticked items can be
 * hidden. The office's view (`office`) gives each item Trello's person and
 * day, and its "…": turned into a card of its own, or deleted.
 */
export function Checklist({
  checklist,
  canAddItems = true,
  canRemoveItems = false,
  compact = false,
  office = null,
}: {
  checklist: ChecklistRow
  canAddItems?: boolean
  /** Office view may delete lines; on site only ticking. */
  canRemoveItems?: boolean
  compact?: boolean
  /** The people an item can be given to — the office's view only. */
  office?: { people: CheckPerson[] } | null
}) {
  const t = useTranslations('checklists')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [local, setLocal] = useState<Record<string, boolean | null>>({})
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [newText, setNewText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hideChecked, setHideChecked] = useState(false)

  const stateOf = (item: ChecklistItemRow) => (item.id in local ? local[item.id] : item.ok)
  const done = checklist.items.filter((i) => stateOf(i) !== null).length
  const problems = checklist.items.filter((i) => stateOf(i) === false).length
  const total = checklist.items.length
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  const shown = hideChecked ? checklist.items.filter((i) => stateOf(i) === null) : checklist.items

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

  const plan = (itemId: string, change: { assigneeId?: string | null; dueDate?: string | null }) =>
    startTransition(async () => {
      setError(null)
      const res = await setChecklistItemPlan(itemId, change)
      if (res.error) setError(res.error === 'notAllowed' ? t('notAllowed') : tc('saveFailed'))
      router.refresh()
    })

  /** Trello's "In Karte umwandeln": the new card opens where this one was open. */
  const toCard = (itemId: string) =>
    startTransition(async () => {
      setError(null)
      const res = await convertChecklistItemToCard(itemId)
      if (!res.id) {
        setError(tc('saveFailed'))
        return
      }
      const url = new URL(window.location.href)
      if (url.searchParams.has('card')) {
        url.searchParams.set('card', res.id)
        router.push(`${url.pathname}${url.search}`, { scroll: false })
      } else router.push(`/projects/${res.id}`)
    })

  return (
    <div className={compact ? '' : 'rounded-lg border border-border bg-surface shadow-sm'}>
      <div className={`flex flex-wrap items-baseline justify-between gap-2 ${compact ? 'pb-2' : 'border-b border-border px-4 py-3'}`}>
        {checklist.name && <p className="text-sm font-semibold">{checklist.name}</p>}
        <p className="text-xs text-muted">
          {t('progress', { done, total })}
          {problems > 0 && (
            <span className="ml-2 font-medium text-amber-700 dark:text-amber-400">
              {t('problems', { count: problems })}
            </span>
          )}
        </p>
        {/* Trello's "Erledigte ausblenden" beside the progress. */}
        {done > 0 && (
          <button
            type="button"
            onClick={() => setHideChecked((h) => !h)}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-1 text-xs font-medium transition-colors hover:bg-surface-hover"
          >
            <EyeOff className="h-3.5 w-3.5" aria-hidden />
            {hideChecked ? t('showChecked') : t('hideChecked', { count: done })}
          </button>
        )}
      </div>
      {/* How far it is ticked, as Trello's bar shows it. */}
      {total > 0 && (
        <div className={`flex items-center gap-2 ${compact ? 'mb-2' : 'px-4 pt-2'}`}>
          <span className="w-8 shrink-0 text-[11px] tabular-nums text-muted">{percent}%</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
            <div className={`h-full rounded-full transition-[width] ${percent === 100 ? 'bg-emerald-600' : 'bg-accent'}`} style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      <ul className={compact ? 'space-y-1.5' : 'divide-y divide-border'}>
        {shown.map((item) => {
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
                  {/* On site the person and the day are read, not set. */}
                  {!office && (item.assignee || item.dueLabel) && (
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
                      {item.dueLabel && <span className={item.dueLate && state === null ? 'font-semibold text-danger' : 'text-muted'}>{item.dueLabel}</span>}
                      {item.assignee && (
                        <span title={item.assignee.name} className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${PERSON_SWATCH[item.assignee.swatch]}`}>
                          {item.assignee.initials}
                        </span>
                      )}
                    </span>
                  )}
                </button>
                {office ? (
                  <div className="mt-1 flex shrink-0 items-center gap-1">
                    <AssignButton item={item} people={office.people} onPick={(id) => plan(item.id, { assigneeId: id })} />
                    <DueButton item={item} onPick={(day) => plan(item.id, { dueDate: day })} />
                    <Menu
                      side="bottom"
                      align="end"
                      label={t('itemMore')}
                      className="rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                      trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}
                    >
                      <button type="button" role="menuitem" className={menuItemClass} disabled={pending} onClick={() => toCard(item.id)}>
                        <SquareArrowOutUpRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                        {t('itemToCard')}
                      </button>
                      {canRemoveItems && (
                        <>
                          <MenuSeparator />
                          <button
                            type="button"
                            role="menuitem"
                            className={`${menuItemClass} text-danger`}
                            onClick={() => startTransition(async () => void (await removeChecklistItem(item.id)))}
                          >
                            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {t('itemDelete')}
                          </button>
                        </>
                      )}
                    </Menu>
                  </div>
                ) : (
                  canRemoveItems && (
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
                  )
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

const SMALL = 'flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-border px-1.5 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground'

/** Trello's person on an item: the face when somebody is on it, else a plus-person; a window to choose. */
function AssignButton({ item, people, onPick }: { item: ChecklistItemRow; people: CheckPerson[]; onPick: (id: string | null) => void }) {
  const t = useTranslations('checklists')
  const tc = useTranslations('common')
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const close = useCallback(() => setOpen(false), [])
  const q = query.trim().toLowerCase()
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} title={item.assignee?.name ?? t('itemAssign')} aria-label={t('itemAssign')} className={SMALL}>
        {item.assignee ? (
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${PERSON_SWATCH[item.assignee.swatch]}`}>
            {item.assignee.initials}
          </span>
        ) : (
          <UserPlus className="h-4 w-4" aria-hidden />
        )}
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={t('itemAssign')} width={260}>
        <PopoverHead title={t('itemAssign')} close={close} closeLabel={tc('close')} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('assignSearch')}
          aria-label={t('assignSearch')}
          className="block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <ul className="-mx-1 mt-2 max-h-64 overflow-y-auto px-1">
          {item.assignee && (
            <li>
              <button
                type="button"
                onClick={() => {
                  onPick(null)
                  close()
                }}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-surface-hover"
              >
                {t('itemAssignNone')}
              </button>
            </li>
          )}
          {people
            .filter((p) => !q || p.name.toLowerCase().includes(q))
            .map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p.id)
                    close()
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-surface-hover ${item.assignee?.id === p.id ? 'bg-accent/10' : ''}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${PERSON_SWATCH[p.swatch]}`}>{p.initials}</span>
                  <span className="truncate">{p.name}</span>
                  {item.assignee?.id === p.id && <Check className="ml-auto h-4 w-4 text-accent" aria-hidden />}
                </button>
              </li>
            ))}
        </ul>
      </Popover>
    </>
  )
}

/** Trello's day on an item: the day when there is one (red once past), else a clock. */
function DueButton({ item, onPick }: { item: ChecklistItemRow; onPick: (day: string | null) => void }) {
  const t = useTranslations('checklists')
  const tc = useTranslations('common')
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState(item.due ?? '')
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => {
          setDay(item.due ?? '')
          setOpen((o) => !o)
        }}
        title={t('itemDue')}
        aria-label={t('itemDue')}
        className={`${SMALL} ${item.dueLate && item.ok === null ? 'border-danger/40 bg-danger/10 text-danger' : ''}`}
      >
        <Clock className="h-4 w-4 shrink-0" aria-hidden />
        {item.dueLabel && <span className="tabular-nums">{item.dueLabel}</span>}
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={t('itemDue')} width={240}>
        <PopoverHead title={t('itemDue')} close={close} closeLabel={tc('close')} />
        <input
          type="date"
          autoFocus
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => {
            onPick(day || null)
            close()
          }}
          className={`${btn.primarySm} mt-3 w-full justify-center`}
        >
          {tc('save')}
        </button>
        {item.due && (
          <button
            type="button"
            onClick={() => {
              onPick(null)
              close()
            }}
            className="mt-1.5 w-full rounded-md bg-subtle px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
          >
            {t('itemDueRemove')}
          </button>
        )}
      </Popover>
    </>
  )
}
