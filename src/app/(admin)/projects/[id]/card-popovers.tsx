'use client'

/**
 * Trello's small windows on a card's back — members, labels, dates, a new
 * checklist — opened from the buttons under the title, from "+ Hinzufügen",
 * and from the members, labels and dates themselves in the row under the
 * title. A change is saved the moment it is made, the way Trello saves it,
 * and shows at once; the server's answer follows with the next drawing.
 */

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { CheckSquare, ChevronLeft, ChevronRight, Clock, MessageSquare, Paperclip, Plus, Star, Tag, UserPlus, Users, X } from 'lucide-react'
import { Popover, PopoverHead } from '@/components/ui/popover'
import { btn } from '@/components/ui/button'
import { LABEL_PILL, PERSON_SWATCH, SUB_LABEL, URGENT_LABEL } from '@/components/swatches'
import { addMonths, dayKey, inRange, monthGrid, monthOf } from '@/lib/calendar-grid'
import { setCardDates, setCardLabel, setCardManager, setCardMember } from '../actions'
import { addProjectChecklist } from './checklist-actions'
import { AttachPanel } from './attach-panel'

export type CardPerson = { id: string; name: string; initials: string; swatch: number }
export type CardTrade = { id: string; name: string; swatch: number }

/** What the windows need to know about the card, and what can be put on it. */
export type CardEditData = {
  projectId: string
  /** Everybody who can be put on a card. */
  people: CardPerson[]
  /** The card's members: the crew and the site manager. */
  members: string[]
  managerId: string | null
  trades: CardTrade[]
  labelIds: string[]
  urgent: boolean
  sub: boolean
  /** "YYYY-MM-DD" or null. */
  dates: { start: string | null; end: string | null; due: string | null }
  checklistTemplates: Array<{ value: string; label: string }>
  /** Where the trades — the labels — are kept, for those who may change them. */
  labelsHref: string | null
}

export type PanelKey = 'members' | 'labels' | 'dates' | 'checklist' | 'attach'

type PanelProps = { data: CardEditData; close: () => void; back: (() => void) | null }

/** The bordered button of Trello's card back. */
export const CARD_BUTTON =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground'

const FIELD =
  'block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'
const SECTION = 'mb-1 mt-3 text-[11px] font-semibold text-muted'

/** The previous value, kept while the server has not answered yet. */
function useOptimistic<T>(value: T): [T, (next: T) => void] {
  const [shown, setShown] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setShown(value)
  }
  return [shown, setShown]
}

function Face({ person, size = 'h-8 w-8 text-[11px]' }: { person: CardPerson; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${size} ${PERSON_SWATCH[person.swatch]}`}>
      {person.initials}
    </span>
  )
}

function MembersPanel({ data, close, back }: PanelProps) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [members, setMembers] = useOptimistic(data.members)
  const [managerId, setManagerId] = useOptimistic(data.managerId)
  const [error, setError] = useState(false)

  const save = (task: () => Promise<{ error?: string }>, undo: () => void) => {
    setError(false)
    startTransition(async () => {
      const result = await task()
      if (result.error) {
        undo()
        setError(true)
      }
      router.refresh()
    })
  }
  const toggle = (id: string, on: boolean) => {
    const before = { members, managerId }
    setMembers(on ? [...members, id] : members.filter((m) => m !== id))
    if (!on && managerId === id) setManagerId(null)
    save(
      () => setCardMember(data.projectId, id, on),
      () => {
        setMembers(before.members)
        setManagerId(before.managerId)
      }
    )
  }
  const lead = (id: string | null) => {
    const before = { members, managerId }
    setManagerId(id)
    if (id && !members.includes(id)) setMembers([...members, id])
    save(
      () => setCardManager(data.projectId, id),
      () => {
        setMembers(before.members)
        setManagerId(before.managerId)
      }
    )
  }

  const q = query.trim().toLowerCase()
  const shown = data.people.filter((p) => !q || p.name.toLowerCase().includes(q))
  const on = shown.filter((p) => members.includes(p.id))
  const off = shown.filter((p) => !members.includes(p.id))

  return (
    <>
      <PopoverHead title={t('sheetMembers')} close={close} closeLabel={tc('close')} back={back} backLabel={t('templateBack')} />
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('membersSearch')} aria-label={t('membersSearch')} className={FIELD} />
      <div className="-mx-1 mt-1 max-h-[min(22rem,55vh)] overflow-y-auto px-1">
        {on.length > 0 && (
          <>
            <p className={SECTION}>{t('membersOnCard')}</p>
            <ul className="space-y-0.5">
              {on.map((person) => {
                const isLead = managerId === person.id
                return (
                  <li key={person.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-hover">
                    <Face person={person} />
                    <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
                    {isLead && <span className="shrink-0 rounded bg-accent/10 px-1 py-0.5 text-[10px] font-semibold text-accent">{t('cardManager')}</span>}
                    <button
                      type="button"
                      onClick={() => lead(isLead ? null : person.id)}
                      title={isLead ? t('memberClearManager') : t('memberMakeManager')}
                      aria-label={isLead ? t('memberClearManager') : t('memberMakeManager')}
                      className={`rounded p-1 transition-opacity ${isLead ? 'text-accent' : 'text-muted opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'} hover:bg-black/5 dark:hover:bg-white/10`}
                    >
                      <Star className="h-3.5 w-3.5" fill={isLead ? 'currentColor' : 'none'} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(person.id, false)}
                      title={t('memberRemove')}
                      aria-label={`${t('memberRemove')}: ${person.name}`}
                      className="rounded p-1 text-muted hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        <p className={SECTION}>{t('membersOthers')}</p>
        {off.length === 0 ? (
          <p className="px-1.5 py-1 text-sm text-muted">{t('membersNone')}</p>
        ) : (
          <ul className="space-y-0.5">
            {off.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => toggle(person.id, true)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface-hover"
                >
                  <Face person={person} />
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {tc('saveFailed')}
        </p>
      )}
    </>
  )
}

function LabelsPanel({ data, close, back }: PanelProps) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [labelIds, setLabelIds] = useOptimistic(data.labelIds)
  const [urgent, setUrgent] = useOptimistic(data.urgent)
  const [sub, setSub] = useOptimistic(data.sub)
  const [error, setError] = useState(false)

  const flip = (key: string, on: boolean) => {
    const before = { labelIds, urgent, sub }
    if (key === 'urgent') setUrgent(on)
    else if (key === 'sub') setSub(on)
    else setLabelIds(on ? [...labelIds, key] : labelIds.filter((l) => l !== key))
    setError(false)
    startTransition(async () => {
      const result = await setCardLabel(data.projectId, key, on)
      if (result.error) {
        setLabelIds(before.labelIds)
        setUrgent(before.urgent)
        setSub(before.sub)
        setError(true)
      }
      router.refresh()
    })
  }

  const rows = [
    { key: 'urgent', name: t('priorityHigh'), pill: URGENT_LABEL.pill, on: urgent },
    { key: 'sub', name: 'SUB', pill: SUB_LABEL.pill, on: sub },
    ...data.trades.map((trade) => ({ key: trade.id, name: trade.name, pill: LABEL_PILL[trade.swatch], on: labelIds.includes(trade.id) })),
  ]
  const q = query.trim().toLowerCase()

  return (
    <>
      <PopoverHead title={t('sheetLabels')} close={close} closeLabel={tc('close')} back={back} backLabel={t('templateBack')} />
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('labelsSearch')} aria-label={t('labelsSearch')} className={FIELD} />
      <p className={SECTION}>{t('sheetLabels')}</p>
      <ul className="-mx-1 max-h-[min(22rem,55vh)] space-y-1 overflow-y-auto px-1">
        {rows
          .filter((row) => !q || row.name.toLowerCase().includes(q))
          .map((row) => (
            <li key={row.key}>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={row.on} onChange={(e) => flip(row.key, e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
                <span className={`flex h-8 min-w-0 flex-1 items-center truncate rounded px-3 text-sm font-medium transition-[filter] hover:brightness-95 ${row.pill}`}>{row.name}</span>
              </label>
            </li>
          ))}
      </ul>
      {data.labelsHref && (
        <Link href={data.labelsHref} className="mt-3 block w-full rounded-md bg-subtle px-3 py-1.5 text-center text-sm font-medium transition-colors hover:bg-surface-hover">
          {t('labelsManage')}
        </Link>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {tc('saveFailed')}
        </p>
      )}
    </>
  )
}

type DateField = 'start' | 'end' | 'due'

function DatesPanel({ data, close, back }: PanelProps) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Record<DateField, string | null>>({ ...data.dates })
  const [active, setActive] = useState<DateField>(data.dates.due || !data.dates.start ? 'due' : 'start')
  const today = dayKey(new Date())
  const [month, setMonth] = useState(() => monthOf(data.dates[data.dates.due ? 'due' : 'start'] ?? today))
  const [error, setError] = useState<string | null>(null)
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'
  const title = new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(month.year, month.month, 1)))
  // Monday first, in the reader's language: 5 January 2026 is a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + i)))
  )

  const pick = (day: string) => {
    setValues((v) => {
      const next = { ...v, [active]: day }
      // A start after the end, or an end before the start, takes the other along.
      if (active === 'start' && next.end && day > next.end) next.end = day
      if (active === 'end' && next.start && day < next.start) next.start = day
      return next
    })
  }
  const save = (next: Record<DateField, string | null>) => {
    setError(null)
    startTransition(async () => {
      const result = await setCardDates(data.projectId, { plannedStart: next.start, plannedEnd: next.end, dueDate: next.due })
      if (result.error) {
        setError(result.error === 'dateOrder' ? t('dateOrder') : tc('saveFailed'))
        return
      }
      close()
      router.refresh()
    })
  }

  const rows: Array<{ key: DateField; label: string }> = [
    { key: 'start', label: t('datesStart') },
    { key: 'end', label: t('datesEnd') },
    { key: 'due', label: t('datesDue') },
  ]

  return (
    <>
      <PopoverHead title={t('sheetDates')} close={close} closeLabel={tc('close')} back={back} backLabel={t('templateBack')} />
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label={t('datesPrevMonth')} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="text-sm font-semibold capitalize">{title}</p>
        <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label={t('datesNextMonth')} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
        {weekdays.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
        {monthGrid(month.year, month.month).map(({ day, inMonth }) => {
          const chosen = day === values.start || day === values.end || day === values.due
          const between = inRange(day, values.start, values.end)
          return (
            <button
              key={day}
              type="button"
              onClick={() => pick(day)}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md tabular-nums transition-colors ${
                chosen
                  ? 'bg-accent font-semibold text-white'
                  : between
                    ? 'bg-accent/15 text-foreground'
                    : inMonth
                      ? 'text-foreground hover:bg-surface-hover'
                      : 'text-muted/60 hover:bg-surface-hover'
              } ${day === today && !chosen ? 'font-bold underline decoration-accent decoration-2 underline-offset-4' : ''}`}
            >
              {Number(day.slice(8))}
            </button>
          )
        })}
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.key}>
            <p className="text-[11px] font-semibold text-muted">{row.label}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={row.label}
                checked={values[row.key] !== null}
                onChange={(e) => {
                  setActive(row.key)
                  setValues((v) => ({ ...v, [row.key]: e.target.checked ? (v[row.key] ?? today) : null }))
                }}
                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <input
                type="date"
                value={values[row.key] ?? ''}
                onFocus={() => setActive(row.key)}
                onChange={(e) => {
                  const value = e.target.value || null
                  setValues((v) => ({ ...v, [row.key]: value }))
                  if (value) setMonth(monthOf(value))
                }}
                className={`${FIELD} ${active === row.key ? 'border-accent ring-1 ring-ring' : ''}`}
              />
            </div>
          </div>
        ))}
      </div>
      <button type="button" disabled={pending} onClick={() => save(values)} className={`${btn.primarySm} mt-4 w-full justify-center`}>
        {tc('save')}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => save({ start: null, end: null, due: null })}
        className="mt-1.5 w-full rounded-md bg-subtle px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-hover"
      >
        {t('datesRemove')}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </>
  )
}

function ChecklistPanel({ data, close, back }: PanelProps) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(t('sheetChecklist'))
  const [templateId, setTemplateId] = useState('')
  const [error, setError] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(false)
    startTransition(async () => {
      const result = await addProjectChecklist(data.projectId, { name: name.trim(), templateId: templateId || undefined })
      if (result.error) {
        setError(true)
        return
      }
      close()
      router.refresh()
      setTimeout(() => document.getElementById('checklists')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
    })
  }

  return (
    <>
      <PopoverHead title={t('checklistAddTitle')} close={close} closeLabel={tc('close')} back={back} backLabel={t('templateBack')} />
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-muted">{t('checklistName')}</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.currentTarget.select()} maxLength={200} className={`mt-1 ${FIELD}`} />
        </label>
        {data.checklistTemplates.length > 0 && (
          <label className="block">
            <span className="text-[11px] font-semibold text-muted">{t('checklistCopyFrom')}</span>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={`mt-1 ${FIELD}`}>
              <option value="">{t('checklistCopyNone')}</option>
              {data.checklistTemplates.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" disabled={pending || (!name.trim() && !templateId)} className={btn.primarySm}>
          {t('sheetAdd')}
        </button>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {tc('saveFailed')}
          </p>
        )}
      </form>
    </>
  )
}

function Panel({ panel, ...props }: PanelProps & { panel: PanelKey }) {
  if (panel === 'members') return <MembersPanel {...props} />
  if (panel === 'labels') return <LabelsPanel {...props} />
  if (panel === 'dates') return <DatesPanel {...props} />
  if (panel === 'attach') return <AttachPanel projectId={props.data.projectId} close={props.close} back={props.back} />
  return <ChecklistPanel {...props} />
}

/**
 * A button that opens one of the windows — under the title, or around the
 * members, labels and dates in the row below it. `pop` in the address opens
 * it straight away: the pencil on a board card leads here that way.
 */
export function CardPanelButton({
  data,
  panel,
  title,
  className,
  children,
  opensFromAddress = false,
}: {
  data: CardEditData
  panel: PanelKey
  title: string
  className: string
  children: ReactNode
  /** The one button on the back that answers `?pop=<panel>`. */
  opensFromAddress?: boolean
}) {
  const anchor = useRef<HTMLButtonElement>(null)
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const asked = opensFromAddress && params.get('pop') === panel
  const [open, setOpen] = useState(asked)
  const close = useCallback(() => setOpen(false), [])

  // Asked for by the address once: the window opens, and the address forgets it.
  useEffect(() => {
    if (!asked) return
    const next = new URLSearchParams(params)
    next.delete('pop')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }, [asked, params, pathname, router])

  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} title={title} aria-label={title} aria-expanded={open} className={className}>
        {children}
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={title}>
        <Panel panel={panel} data={data} close={close} back={null} />
      </Popover>
    </>
  )
}

type AddLabels = { add: string; members: string; labels: string; checklist: string; dates: string; attachment: string; comment: string }

const jump = (id: string, focus = false) => {
  const target = document.getElementById(id)
  // The comments stand beside the cards and are in view already; what they
  // need is the caret, not a scroll that moves the whole sheet for nothing.
  target?.scrollIntoView({ behavior: 'smooth', block: focus ? 'nearest' : 'start' })
  if (focus) setTimeout(() => target?.querySelector<HTMLElement>('textarea')?.focus({ preventScroll: true }), 350)
}

/**
 * "+ Hinzufügen": Trello's list of what can be added to a card, each with a
 * line on what it is for; a choice turns the window into that one.
 */
export function CardAddButton({ data, labels }: { data: CardEditData; labels: AddLabels }) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<PanelKey | null>(null)
  const close = useCallback(() => {
    setOpen(false)
    setPanel(null)
  }, [])

  const items: Array<{ icon: typeof Tag; label: string; hint: string; run: () => void }> = [
    { icon: Tag, label: labels.labels, hint: t('addLabelsHint'), run: () => setPanel('labels') },
    { icon: Clock, label: labels.dates, hint: t('addDatesHint'), run: () => setPanel('dates') },
    { icon: CheckSquare, label: labels.checklist, hint: t('addChecklistHint'), run: () => setPanel('checklist') },
    { icon: Users, label: labels.members, hint: t('addMembersHint'), run: () => setPanel('members') },
    { icon: Paperclip, label: labels.attachment, hint: t('addAttachmentHint'), run: () => setPanel('attach') },
    {
      icon: MessageSquare,
      label: labels.comment,
      hint: t('addCommentHint'),
      run: () => {
        close()
        jump('comments', true)
      },
    },
  ]

  return (
    <>
      <button ref={anchor} type="button" onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} className={CARD_BUTTON}>
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        {labels.add}
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={labels.add}>
        {panel ? (
          <Panel panel={panel} data={data} close={close} back={() => setPanel(null)} />
        ) : (
          <>
            <PopoverHead title={labels.add} close={close} closeLabel={tc('close')} />
            <ul className="-mx-1 space-y-0.5">
              {items.map(({ icon: Icon, label, hint, run }) => (
                <li key={label}>
                  <button type="button" onClick={run} className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-hover">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted">{hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Popover>
    </>
  )
}

/** The row of buttons under the title: "+ Hinzufügen", and the four used most, each opening its window. */
export function CardAddBar({ data, labels }: { data: CardEditData; labels: AddLabels }) {
  const quick: Array<{ panel: PanelKey; icon: typeof Tag; label: string }> = [
    { panel: 'labels', icon: Tag, label: labels.labels },
    { panel: 'dates', icon: Clock, label: labels.dates },
    { panel: 'checklist', icon: CheckSquare, label: labels.checklist },
    { panel: 'members', icon: UserPlus, label: labels.members },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CardAddButton data={data} labels={labels} />
      {quick.map(({ panel, icon: Icon, label }) => (
        <CardPanelButton key={panel} data={data} panel={panel} title={label} className={CARD_BUTTON} opensFromAddress>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {label}
        </CardPanelButton>
      ))}
    </div>
  )
}
