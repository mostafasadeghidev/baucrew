'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ComboboxOption } from '@/components/combobox'
import { createScheduleEntry, deleteScheduleEntry, moveScheduleEntry, updateScheduleEntry } from './actions'
import { EntryDialog, type BoardEntry, type DialogState } from './entry-dialog'

const MAX_PER_DAY = 5

/**
 * Interactive month calendar: same dialog, create (+) and drag & drop as the
 * week board, on a compact grid. Mouse uses native HTML5 drag & drop; touch
 * pointers pick a chip up with a long-press.
 */
export function MonthBoard({
  weeks,
  monthKey,
  monthLabel,
  weekdayLabels,
  weekNumbers,
  todayIso,
  entries,
  prevHref,
  nextHref,
  currentHref,
  weekHref,
  overviewHref,
  projects,
  employees,
  vehicles,
}: {
  weeks: string[][]
  /** "yyyy-mm" of the displayed month (other days are dimmed). */
  monthKey: string
  monthLabel: string
  weekdayLabels: string[]
  weekNumbers: number[]
  todayIso: string
  entries: BoardEntry[]
  prevHref: string
  nextHref: string
  currentHref: string
  weekHref: string
  overviewHref: string
  projects: ComboboxOption[]
  employees: ComboboxOption[]
  vehicles: ComboboxOption[]
}) {
  const t = useTranslations('schedule')
  const tc = useTranslations('common')
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
  const [boardError, setBoardError] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const byDay = new Map<string, BoardEntry[]>()
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])

  function errorText(key: string | undefined): string | null {
    if (!key) return null
    if (key === 'duplicateEntry') return t('duplicateEntry')
    if (key === 'projectRequired') return t('projectRequired')
    return tc('saveFailed')
  }
  function moveTo(id: string, date: string) {
    setDropTarget(null)
    setBoardError(null)
    startTransition(async () => {
      const result = await moveScheduleEntry(id, date)
      if (result.error) setBoardError(errorText(result.error))
    })
  }
  function onDrop(date: string, e: React.DragEvent) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id) moveTo(id, date)
  }

  // Touch drag (long-press) — same approach as the week board.
  const touchDrag = useRef<{
    id: string
    timer: ReturnType<typeof setTimeout> | null
    active: boolean
    startX: number
    startY: number
    ghost: HTMLElement | null
  } | null>(null)
  const suppressClick = useRef(false)
  function cellAtPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)
    return el?.closest<HTMLElement>('[data-day-column]')?.dataset.dayColumn ?? null
  }
  function onChipPointerDown(e: React.PointerEvent<HTMLDivElement>, entryId: string) {
    if (e.pointerType === 'mouse') return
    const chip = e.currentTarget
    touchDrag.current = {
      id: entryId,
      timer: setTimeout(() => {
        const s = touchDrag.current
        if (!s || s.id !== entryId) return
        s.active = true
        const ghost = chip.cloneNode(true) as HTMLElement
        const rect = chip.getBoundingClientRect()
        ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;pointer-events:none;opacity:.85;z-index:60;`
        document.body.appendChild(ghost)
        s.ghost = ghost
        chip.style.opacity = '0.4'
        try {
          chip.setPointerCapture(e.pointerId)
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
  function onChipPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = touchDrag.current
    if (!s) return
    if (!s.active) {
      if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > 10) {
        if (s.timer) clearTimeout(s.timer)
        touchDrag.current = null
      }
      return
    }
    e.preventDefault()
    if (s.ghost) s.ghost.style.transform = `translate(${e.clientX - s.startX}px, ${e.clientY - s.startY}px)`
    setDropTarget(cellAtPoint(e.clientX, e.clientY))
  }
  function onChipPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const s = touchDrag.current
    touchDrag.current = null
    if (!s) return
    if (s.timer) clearTimeout(s.timer)
    e.currentTarget.style.opacity = ''
    if (!s.active) return
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 300)
    s.ghost?.remove()
    const target = cellAtPoint(e.clientX, e.clientY)
    if (target) moveTo(s.id, target)
    else setDropTarget(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <span className="text-lg font-medium text-muted">{monthLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-md border border-border text-sm font-medium">
            <Link href={weekHref} className="px-3 py-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
              {t('viewWeek')}
            </Link>
            <span className="bg-accent px-3 py-1.5 text-accent-foreground">{t('viewMonth')}</span>
            <Link href={overviewHref} className="px-3 py-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
              {t('viewOverview')}
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <Link href={prevHref} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">
              ←
            </Link>
            <Link href={currentHref} className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">
              {t('currentWeek')}
            </Link>
            <Link href={nextHref} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">
              →
            </Link>
          </div>
        </div>
      </div>

      {boardError && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {boardError}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="w-12 px-2 py-2 font-medium">KW</th>
              {weekdayLabels.map((l) => (
                <th key={l} className="px-2 py-2 font-medium">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={week[0]} className="border-b border-border last:border-b-0">
                <td className="px-2 py-2 align-top">
                  <Link href={`/schedule?week=${week[0]}`} className="font-semibold text-accent hover:underline">
                    {weekNumbers[wi]}
                  </Link>
                </td>
                {week.map((day) => {
                  const dayEntries = byDay.get(day) ?? []
                  const expanded = expandedDay === day
                  const shown = expanded ? dayEntries : dayEntries.slice(0, MAX_PER_DAY)
                  const extra = dayEntries.length - shown.length
                  const inMonth = day.slice(0, 7) === monthKey
                  const isWeekend = [0, 6].includes(new Date(`${day}T00:00:00.000Z`).getUTCDay())
                  return (
                    <td
                      key={day}
                      data-day-column={day}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setDropTarget(day)}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
                      }}
                      onDrop={(e) => onDrop(day, e)}
                      className={`group h-24 border-l border-border px-1.5 py-1.5 align-top transition-colors ${
                        inMonth ? '' : 'bg-surface-hover/50 text-muted'
                      } ${isWeekend ? 'bg-surface-hover/30' : ''} ${day === todayIso ? 'bg-accent/5' : ''} ${
                        dropTarget === day ? 'ring-1 ring-inset ring-accent bg-accent/10' : ''
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <Link
                          href={`/schedule?week=${week[0]}`}
                          className={`inline-block rounded px-1 text-[11px] font-semibold tabular-nums ${
                            day === todayIso ? 'bg-accent text-accent-foreground' : ''
                          }`}
                        >
                          {Number(day.slice(8, 10))}
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDialog({ mode: 'create', date: day })}
                          title={t('addEntry')}
                          aria-label={t('addEntry')}
                          className="flex h-5 w-5 items-center justify-center rounded border border-border text-[11px] text-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                        >
                          +
                        </button>
                      </div>
                      <div className="space-y-0.5">
                        {shown.map((e) => (
                          <div
                            key={e.id}
                            role="button"
                            tabIndex={0}
                            draggable
                            onDragStart={(ev) => ev.dataTransfer.setData('text/plain', e.id)}
                            onPointerDown={(ev) => onChipPointerDown(ev, e.id)}
                            onPointerMove={onChipPointerMove}
                            onPointerUp={onChipPointerEnd}
                            onPointerCancel={onChipPointerEnd}
                            onClick={() => {
                              if (suppressClick.current) return
                              setDialog({ mode: 'edit', entry: e })
                            }}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter') setDialog({ mode: 'edit', entry: e })
                            }}
                            style={{ touchAction: 'pan-y' }}
                            title={[e.projectName, [e.startTime, e.endTime].filter(Boolean).join('–'), e.vehicles.map((v) => v.name).join(', ')]
                              .filter(Boolean)
                              .join(' · ')}
                            className={`cursor-grab truncate rounded px-1 py-0.5 hover:ring-1 hover:ring-accent active:cursor-grabbing ${
                              e.hasConflict ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-accent/10 text-foreground'
                            }`}
                          >
                            {e.hasConflict && '⚠ '}
                            {e.projectName}
                          </div>
                        ))}
                        {extra > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedDay(day)}
                            className="mt-0.5 block w-full rounded border border-dashed border-accent/60 bg-accent/5 px-1 py-0.5 text-center text-[11px] font-medium text-accent hover:bg-accent/15"
                          >
                            {t('moreEntries', { count: extra })}
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">{t('dragHint')}</p>

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
              const result = entryId ? await updateScheduleEntry(entryId, input) : await createScheduleEntry(input)
              if (result.error) setBoardError(errorText(result.error))
              else setDialog({ mode: 'closed' })
            })
          }}
          onDelete={(entryId) => {
            if (!confirm(t('deleteConfirm'))) return
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
