'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ComboboxOption } from '@/components/combobox'
import {
  copyScheduleEntry,
  createScheduleEntry,
  deleteScheduleEntry,
  moveScheduleEntry,
  updateScheduleEntry,
} from './actions'
import { EntryDialog, type DialogState, type BoardEntry } from './entry-dialog'
import { btn } from '@/components/ui/button'
export type { BoardEntry } from './entry-dialog'



export function ScheduleBoard({
  days,
  weekendToggle,
  weekNumber,
  prevWeekHref,
  nextWeekHref,
  currentWeekHref,
  overviewHref,
  monthHref,
  todayIso,
  entries,
  conflictMessages,
  weatherMessages,
  projects,
  employees,
  vehicles,
  locale,
}: {
  days: string[]
  /** null = weekend columns are forced on by existing entries; otherwise a link to show/hide them. */
  weekendToggle: { href: string; active: boolean } | null
  weekNumber: number
  prevWeekHref: string
  nextWeekHref: string
  currentWeekHref: string
  overviewHref: string
  monthHref: string
  todayIso: string
  entries: BoardEntry[]
  conflictMessages: string[]
  weatherMessages: string[]
  projects: ComboboxOption[]
  employees: ComboboxOption[]
  vehicles: ComboboxOption[]
  locale: string
}) {
  const t = useTranslations('schedule')
  const tc = useTranslations('common')
  const tSheet = useTranslations('sheet')
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
  const [boardError, setBoardError] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const dayFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'long',
    timeZone: 'UTC',
  })
  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

  function errorText(key: string | undefined): string | null {
    if (!key) return null
    if (key === 'duplicateEntry') return t('duplicateEntry')
    if (key === 'projectRequired') return t('projectRequired')
    return tc('saveFailed')
  }

  function moveTo(id: string, date: string, copy = false) {
    setDropTarget(null)
    setBoardError(null)
    startTransition(async () => {
      const result = copy ? await copyScheduleEntry(id, date) : await moveScheduleEntry(id, date)
      if (result.error) setBoardError(errorText(result.error))
    })
  }

  function onDrop(date: string, e: React.DragEvent) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    // Ctrl / ⌘ while dropping duplicates the assignment instead of moving it.
    if (id) moveTo(id, date, e.ctrlKey || e.metaKey)
  }

  // ── Touch drag (Pointer Events) ─────────────────────────────
  // Native HTML5 drag & drop does not fire on touch screens. For touch/pen
  // pointers a long-press (250 ms) picks the card up; the card follows the
  // finger, columns highlight via hit-testing, release drops it.
  const touchDrag = useRef<{
    id: string
    timer: ReturnType<typeof setTimeout> | null
    active: boolean
    startX: number
    startY: number
    ghost: HTMLElement | null
  } | null>(null)

  function columnAtPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)
    const col = el?.closest<HTMLElement>('[data-day-column]')
    return col?.dataset.dayColumn ?? null
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>, entryId: string) {
    if (e.pointerType === 'mouse') return // mouse uses native drag & drop
    const card = e.currentTarget
    touchDrag.current = {
      id: entryId,
      timer: setTimeout(() => {
        const state = touchDrag.current
        if (!state || state.id !== entryId) return
        state.active = true
        const ghost = card.cloneNode(true) as HTMLElement
        const rect = card.getBoundingClientRect()
        ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;pointer-events:none;opacity:.85;z-index:60;transform:rotate(1.5deg);`
        document.body.appendChild(ghost)
        state.ghost = ghost
        card.style.opacity = '0.4'
        // Keep receiving moves even when the finger leaves the card,
        // and stop the page from scrolling while dragging.
        try {
          card.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        if (navigator.vibrate) navigator.vibrate(15)
      }, 250),
      active: false,
      startX: e.clientX,
      startY: e.clientY,
      ghost: null,
    }
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = touchDrag.current
    if (!state) return
    if (!state.active) {
      // Moved before the long-press fired → this is a scroll, cancel pickup.
      if (Math.hypot(e.clientX - state.startX, e.clientY - state.startY) > 10) {
        if (state.timer) clearTimeout(state.timer)
        touchDrag.current = null
      }
      return
    }
    e.preventDefault()
    if (state.ghost) {
      state.ghost.style.transform = `translate(${e.clientX - state.startX}px, ${e.clientY - state.startY}px) rotate(1.5deg)`
    }
    setDropTarget(columnAtPoint(e.clientX, e.clientY))
  }

  const suppressClick = useRef(false)

  function onCardPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const state = touchDrag.current
    touchDrag.current = null
    if (!state) return
    if (state.timer) clearTimeout(state.timer)
    e.currentTarget.style.opacity = ''
    if (!state.active) return
    // Swallow the synthetic click that follows a completed touch-drag.
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 300)
    state.ghost?.remove()
    const target = columnAtPoint(e.clientX, e.clientY)
    if (target) moveTo(state.id, target)
    else setDropTarget(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <span className="text-lg font-medium text-muted">
            {t('weekLabel', { week: weekNumber })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-subtle p-1 text-sm font-medium">
            <span className="rounded-md bg-surface px-3 py-1 text-foreground shadow-sm">{t('viewWeek')}</span>
            <Link href={monthHref} className="rounded-md px-3 py-1 text-muted transition-colors hover:text-foreground">
              {t('viewMonth')}
            </Link>
            <Link href={overviewHref} className="rounded-md px-3 py-1 text-muted transition-colors hover:text-foreground">
              {t('viewOverview')}
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href={prevWeekHref}
              className={btn.outlineSm}
              title={t('prevWeek')}
            >
              ←
            </Link>
            <Link
              href={currentWeekHref}
              className={btn.outlineSm}
            >
              {t('currentWeek')}
            </Link>
            <Link
              href={nextWeekHref}
              className={btn.outlineSm}
              title={t('nextWeek')}
            >
              →
            </Link>
          </div>
          {weekendToggle && (
            <Link
              href={weekendToggle.href}
              title={t('weekendHint')}
              className={`whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium ${
                weekendToggle.active
                  ? 'border-accent bg-accent/10 text-accent hover:bg-accent/15'
                  : 'border-border text-muted hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              {weekendToggle.active ? t('hideWeekend') : t('showWeekend')}
            </Link>
          )}
        </div>
      </div>

      {conflictMessages.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold">⚠ {t('conflictsTitle')}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-muted">
            {conflictMessages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {weatherMessages.length > 0 && (
        <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-4">
          <p className="text-sm font-semibold">🌧 {t('weatherTitle')}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-muted">
            {weatherMessages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {boardError && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {boardError}
        </p>
      )}

      <div className={`grid grid-cols-1 gap-3 ${days.length > 5 ? 'md:grid-cols-7' : 'md:grid-cols-5'}`}>
        {days.map((date) => {
          const dayEntries = entries.filter((e) => e.date === date)
          const isToday = date === todayIso
          const isWeekend = [0, 6].includes(new Date(`${date}T00:00:00.000Z`).getUTCDay())
          return (
            <div
              key={date}
              data-day-column={date}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => setDropTarget(date)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
              }}
              onDrop={(e) => onDrop(date, e)}
              className={`flex min-h-64 flex-col rounded-lg border shadow-sm transition-colors ${
                isWeekend ? 'border-dashed bg-surface/60' : 'bg-surface'
              } ${dropTarget === date ? 'border-accent ring-1 ring-accent' : 'border-border'}`}
            >
              <div
                className={`flex items-center justify-between border-b border-border px-3 py-2 ${
                  isToday ? 'bg-accent/10' : ''
                }`}
              >
                <div>
                  <p className={`text-sm font-semibold ${isToday ? 'text-accent' : ''}`}>
                    {dayFmt.format(new Date(`${date}T00:00:00.000Z`))}
                  </p>
                  <p className="text-xs text-muted">{dateFmt.format(new Date(`${date}T00:00:00.000Z`))}</p>
                </div>
                {date >= todayIso && (
                <button
                  type="button"
                  onClick={() => setDialog({ mode: 'create', date })}
                  title={t('addEntry')}
                  aria-label={t('addEntry')}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-hover hover:text-foreground"
                >
                  +
                </button>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {dayEntries.map((entry) => (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', entry.id)}
                    onPointerDown={(e) => onCardPointerDown(e, entry.id)}
                    onPointerMove={onCardPointerMove}
                    onPointerUp={onCardPointerEnd}
                    onPointerCancel={onCardPointerEnd}
                    onClick={() => {
                      // A completed touch-drag must not open the dialog.
                      if (suppressClick.current) return
                      setDialog({ mode: 'edit', entry })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setDialog({ mode: 'edit', entry })
                    }}
                    style={{ touchAction: 'pan-y' }}
                    className={`cursor-grab rounded-md border p-2 text-left text-xs shadow-sm transition-colors hover:border-accent active:cursor-grabbing ${
                      ['COMPLETED', 'INVOICED', 'PAID'].includes(entry.projectStatus ?? '')
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                        : entry.hasConflict
                          ? 'border-amber-500/60 bg-amber-500/10'
                          : 'border-border bg-background'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-semibold">
                        {['COMPLETED', 'INVOICED', 'PAID'].includes(entry.projectStatus ?? '') && <span title={t('completeProject')}>✓ </span>}
                        {entry.hasConflict && <span title={t('conflictsTitle')}>⚠ </span>}
                        {entry.projectName}
                      </p>
                      <Link
                        href={`/projects/${entry.projectId}/sheet?entry=${entry.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title={tSheet('title')}
                        aria-label={tSheet('title')}
                        className="shrink-0 rounded border border-border p-1 text-muted hover:bg-surface-hover hover:text-foreground"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                          <rect x="6" y="14" width="12" height="8" />
                        </svg>
                      </Link>
                    </div>
                    <p className="text-muted">
                      {entry.projectNumber} · {entry.customerName}
                    </p>
                    {(entry.vehicles.length > 0 || entry.startTime) && (
                      <p className="mt-1 text-muted">
                        {[[entry.startTime, entry.endTime].filter(Boolean).join('–'), entry.vehicles.map((v) => v.name).join(', ')]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {entry.employees.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {entry.employees.map((e) => (
                          <span key={e.id} className="rounded-full bg-surface-hover px-1.5 py-0.5">
                            {e.name.split(' ')[0]}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
        <span>{t('dragHint')}</span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border border-border bg-subtle px-1.5 py-0.5 font-sans text-[11px] font-medium text-foreground">
            Ctrl
          </kbd>
          <span>{t('dragCopyHint')}</span>
        </span>
      </p>

      {dialog.mode !== 'closed' && (
        <EntryDialog
          key={dialog.mode === 'edit' ? dialog.entry.id : `create-${dialog.date}`}
          dialog={dialog}
          projects={projects}
          employees={employees}
          vehicles={vehicles}
          pending={pending}
          onClose={() => setDialog({ mode: 'closed' })}
          onSubmit={(input, entryId) => {
            startTransition(async () => {
              const result = entryId
                ? await updateScheduleEntry(entryId, input)
                : await createScheduleEntry(input)
              if (result.error) setBoardError(errorText(result.error))
              else setDialog({ mode: 'closed' })
            })
          }}
          onDelete={(entryId) => {
            startTransition(async () => {
              await deleteScheduleEntry(entryId)
              setDialog({ mode: 'closed' })
            })
          }}
        />
      )}
    </div>
  )
}
