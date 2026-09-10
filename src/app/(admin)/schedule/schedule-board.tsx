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
import { EntryDialog, type AbsenceHint, type DialogState, type BoardEntry } from './entry-dialog'
import { Menu, MenuLabel } from '@/components/ui/menu'
import { ScheduleHeader } from './schedule-header'
export type { BoardEntry } from './entry-dialog'



/** A counter in the strip above the board: short, round, and never wrapping. */
const chip =
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium transition-opacity hover:opacity-80'

export function ScheduleBoard({
  weeks,
  weekendToggle,
  followingWeek,
  prevWeekHref,
  nextWeekHref,
  currentWeekHref,
  mapHref,
  monthHref,
  todayIso,
  entries,
  conflictMessages,
  weatherMessages,
  projects,
  employees,
  vehicles,
  absences = [],
  locale,
}: {
  /**
   * One entry per week on the board, in order. Two of them means the office
   * asked for the following week as well; every week shows the same days, so
   * the columns of one line up with the columns of the next.
   */
  weeks: Array<{ number: number; days: string[] }>
  /**
   * The weekend columns. `href: null` means they are on because an assignment
   * falls on a Saturday or Sunday and cannot be switched off — the control is
   * still drawn, locked, so the header keeps its width.
   */
  weekendToggle: { href: string | null; active: boolean }
  /** Whether the week after this one is on the board, and how to change that. */
  followingWeek: { href: string; active: boolean }
  prevWeekHref: string
  nextWeekHref: string
  currentWeekHref: string
  mapHref: string
  monthHref: string
  todayIso: string
  entries: BoardEntry[]
  conflictMessages: string[]
  weatherMessages: string[]
  projects: ComboboxOption[]
  employees: ComboboxOption[]
  vehicles: ComboboxOption[]
  absences?: AbsenceHint[]
  locale: string
}) {
  const t = useTranslations('schedule')
  const tc = useTranslations('common')
  const tSheet = useTranslations('sheet')
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
  const [boardError, setBoardError] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  /** Two weeks on the board means the warnings are not about "this week". */
  const conflictsTitle = weeks.length > 1 ? t('conflictsTitleTwo') : t('conflictsTitle')

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
      <ScheduleHeader
        title={t('title')}
        view="week"
        weekHref={currentWeekHref}
        monthHref={monthHref}
        mapHref={mapHref}
        viewLabels={{ week: t('viewWeek'), month: t('viewMonth'), map: t('viewMap') }}
        periodLabel={
          weeks.length > 1
            ? t('weekRange', { from: weeks[0].number, to: weeks[weeks.length - 1].number })
            : t('weekLabel', { week: weeks[0].number })
        }
        prevHref={prevWeekHref}
        nextHref={nextWeekHref}
        currentHref={currentWeekHref}
        currentLabel={t('current')}
        prevLabel={t('prevWeek')}
        nextLabel={t('nextWeek')}
        toggles={[
          {
            href: weekendToggle.href,
            label: t('weekend'),
            active: weekendToggle.active,
            title: weekendToggle.href === null ? t('weekendLocked') : t('weekendHint'),
          },
          {
            href: followingWeek.href,
            label: t('followingWeek'),
            active: followingWeek.active,
            title: t('followingWeekHint'),
          },
        ]}
      />

      {/* One line, always here, always the same height. What it says changes
          with the week; where the day columns begin does not. Blocks that came
          and went with the week used to push the whole board up and down as
          somebody paged through it. The detail opens in a menu over the board
          rather than under this line, for the same reason. */}
      <div className="flex h-9 items-center gap-2 overflow-x-auto rounded-md border border-border bg-subtle px-2.5 text-xs">
        {conflictMessages.length === 0 && weatherMessages.length === 0 && !boardError ? (
          <span className="whitespace-nowrap text-muted">{t('allClear')}</span>
        ) : (
          <>
            {conflictMessages.length > 0 && (
              <Menu
                side="bottom"
                align="start"
                label={conflictsTitle}
                className={`${chip} bg-amber-500/15 text-amber-700 dark:text-amber-400`}
                trigger={<>⚠ {t('conflictsCount', { count: conflictMessages.length })}</>}
              >
                <div className="max-w-[22rem]">
                  <MenuLabel>{conflictsTitle}</MenuLabel>
                  {conflictMessages.map((m, i) => (
                    <p key={i} className="px-2 py-1 text-sm text-muted">
                      {m}
                    </p>
                  ))}
                </div>
              </Menu>
            )}
            {weatherMessages.length > 0 && (
              <Menu
                side="bottom"
                align="start"
                label={t('weatherTitle')}
                className={`${chip} bg-sky-500/15 text-sky-700 dark:text-sky-400`}
                trigger={<>🌧 {t('weatherCount', { count: weatherMessages.length })}</>}
              >
                <div className="max-w-[22rem]">
                  <MenuLabel>{t('weatherTitle')}</MenuLabel>
                  {weatherMessages.map((m, i) => (
                    <p key={i} className="px-2 py-1 text-sm text-muted">
                      {m}
                    </p>
                  ))}
                </div>
              </Menu>
            )}
            {boardError && (
              <span role="alert" className="whitespace-nowrap font-medium text-danger">
                {boardError}
              </span>
            )}
          </>
        )}
      </div>

      {/* One grid per week, stacked. Every week is given the same days, so the
          Monday of the second sits under the Monday of the first — and a card
          can be dragged from any day to any other, whichever week it is in:
          the drop only ever carries a date. */}
      {weeks.map((week) => (
        <div key={week.number} className="space-y-2">
          {/* Always here, one week or two: a caption that appears with the
              second week would push the first week's columns down the page as
              soon as the toggle was pressed. */}
          <p className="text-xs font-medium text-muted">{t('weekLabel', { week: week.number })}</p>
          <div
            className={`grid grid-cols-1 gap-3 ${
              week.days.length > 5 ? 'md:grid-cols-7' : 'md:grid-cols-5'
            }`}
          >
        {week.days.map((date) => {
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
        </div>
      ))}

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
          absences={absences}
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
