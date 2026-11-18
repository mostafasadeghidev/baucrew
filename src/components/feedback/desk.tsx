'use client'

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { Bot, Check, Columns3, Image as ImageIcon, List, MessageSquare, MessageSquarePlus, RefreshCw, Search, SlidersHorizontal, Sparkles } from 'lucide-react'
import { moveFeedback } from '@/app/feedback-actions'
import {
  DEFAULT_FILTERS,
  FEEDBACK_SORTS,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  WAITING_ON,
  activeFilterCount,
  cleanFilters,
  feedbackHandoff,
  groupByStatus,
  hasProposal,
  isOpen,
  queryFeedback,
  toggledStatus,
  type FeedbackFilters,
  type FeedbackItemDTO,
  type FeedbackStatus,
} from '@/lib/feedback'
import { btn } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Popover } from '@/components/ui/popover'
import { PageBar, StickyHead } from '@/components/ui/page-panel'
import { pillTab } from '@/components/ui/tabs'
import { ItemDrawer } from './item-drawer'
import { STATUS_DOT, StatusPill, WaitingChip } from './status-pill'

type View = 'list' | 'kanban'

/** The filter button while a filter is on: the same button, outlined in the accent. */
const filterOn = btn.outlineSm.replace('border-border-strong', 'border-accent').replace('bg-surface ', 'bg-accent/5 text-accent ')

const STORE = 'baucrew.feedback.desk'

// What this person last looked at — the view and the filters — on this
// browser only. Kept in memory too, for a private window that keeps nothing.
let memory: string | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

const noop = () => () => {}

function readPrefs(): string | null {
  try {
    return localStorage.getItem(STORE) ?? memory
  } catch {
    return memory
  }
}

function writePrefs(prefs: { view: View; filters: FeedbackFilters }) {
  memory = JSON.stringify(prefs)
  try {
    localStorage.setItem(STORE, memory)
  } catch {
    // Nothing kept beyond this page; the desk works the same.
  }
  listeners.forEach((l) => l())
}

function parsePrefs(raw: string | null): { view: View; filters: FeedbackFilters } {
  try {
    const value = JSON.parse(raw ?? '{}') as { view?: unknown; filters?: unknown }
    return { view: value.view === 'kanban' ? 'kanban' : 'list', filters: cleanFilters(value.filters) }
  } catch {
    return { view: 'list', filters: DEFAULT_FILTERS }
  }
}

/**
 * The tasks made of feedback: one search, one filter, one sort, shown as a
 * list or as a board of status columns. A click opens the item in a drawer
 * beside the list; its address (?item=64) can be sent along.
 */
export function FeedbackDesk({
  items,
  canEdit,
  area,
  commentHref,
  initialItem,
}: {
  items: FeedbackItemDTO[]
  canEdit: boolean
  /** The office's frame (sticky head) or the crew's phone frame. */
  area: 'admin' | 'my'
  commentHref: string
  initialItem: number | null
}) {
  const t = useTranslations('feedback')
  const tErr = useTranslations('feedback.errors')
  const format = useFormatter()
  const router = useRouter()
  const raw = useSyncExternalStore(subscribe, readPrefs, () => null)
  // The drawer hangs off the document's body: only once there is one.
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const { view, filters } = useMemo(() => parsePrefs(raw), [raw])
  const setView = (next: View) => writePrefs({ view: next, filters })
  const setFilters = (next: FeedbackFilters | ((f: FeedbackFilters) => FeedbackFilters)) =>
    writePrefs({ view, filters: typeof next === 'function' ? next(filters) : next })
  const [selected, setSelected] = useState<number | null>(initialItem)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [toast, setToast] = useState('')
  const [json, setJson] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [refreshing, startRefresh] = useTransition()
  const [, startMove] = useTransition()
  const [shownItems, moveOptimistic] = useOptimistic(items, (state, move: { id: string; status: FeedbackStatus }) =>
    state.map((i) => (i.id === move.id ? { ...i, status: move.status } : i))
  )

  // The open item is part of the address, so a link to it opens it.
  const select = useCallback((number: number | null) => {
    setSelected(number)
    const url = new URL(window.location.href)
    if (number == null) url.searchParams.delete('item')
    else url.searchParams.set('item', String(number))
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }, [])

  // Notes written but not saved survive switching items, not a reload: say so first.
  const unsaved = Object.values(drafts).some((d) => d.trim())
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(id)
  }, [toast])

  const shown = useMemo(() => queryFeedback(shownItems, filters), [shownItems, filters])
  const item = selected == null ? null : (shownItems.find((i) => i.number === selected) ?? null)

  function move(target: FeedbackItemDTO, status: FeedbackStatus) {
    if (!canEdit || target.status === status) return
    startMove(async () => {
      moveOptimistic({ id: target.id, status })
      const result = await moveFeedback(target.id, status)
      if (result.error) setToast(tErr(result.error))
    })
  }

  async function copy(list: FeedbackItemDTO[]) {
    const text = JSON.stringify(feedbackHandoff(list, { origin: window.location.origin }), null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setToast(t('copied', { count: list.length }))
    } catch {
      setJson(text)
    }
  }

  async function copyLink(target: FeedbackItemDTO) {
    const url = new URL(window.location.href)
    url.search = `?item=${target.number}`
    try {
      await navigator.clipboard.writeText(url.toString())
      setToast(t('detail.linkCopied'))
    } catch {
      setJson(url.toString())
    }
  }

  const head = (
    <PageBar
      title={t('title')}
      tabs={
        <div role="tablist" aria-label={t('view.label')} className="flex items-center gap-0.5">
          {(
            [
              ['list', List],
              ['kanban', Columns3],
            ] as const
          ).map(([v, Icon]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`${pillTab.base} ${view === v ? pillTab.on : pillTab.off}`}>
              <Icon className="h-4 w-4" aria-hidden />
              {t(`view.${v}`)}
              {view === v && <span className="text-xs tabular-nums text-muted">{shown.length}</span>}
            </button>
          ))}
        </div>
      }
      actions={
        <>
          <SearchField value={filters.search} onChange={(search) => setFilters((f) => ({ ...f, search }))} />
          <FilterButton filters={filters} setFilters={setFilters} />
          <Select compact aria-label={t('sort.label')} value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as FeedbackFilters['sort'] }))}>
            {FEEDBACK_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => {
              setRefreshedAt(new Date())
              startRefresh(() => router.refresh())
            }}
            className={btn.icon}
            aria-label={t('refresh')}
            title={refreshedAt ? t('refreshedAt', { time: format.dateTime(refreshedAt, { timeStyle: 'short' }) }) : t('refresh')}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
          </button>
          <Link href={commentHref} className={btn.outlineSm} title={t('commentHint')}>
            <MessageSquarePlus className="h-4 w-4" aria-hidden />
            {t('comment')}
          </Link>
          {area === 'admin' && (
            <button type="button" onClick={() => void copy(shown)} disabled={!shown.length} className={btn.primarySm}>
              <Bot className="h-4 w-4" aria-hidden />
              {t('copyForAgent')}
            </button>
          )}
        </>
      }
    />
  )

  return (
    <div className="space-y-5">
      {area === 'admin' ? <StickyHead>{head}</StickyHead> : <div className="border-b border-border pb-1">{head}</div>}

      {!items.length ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted">{t('empty')}</p>
      ) : !shown.length ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted">
          <p>{t('emptyFiltered')}</p>
          <div className="mt-3">
            <button type="button" onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })} className={btn.outlineSm}>
              {t('filter.reset')}
            </button>
          </div>
        </div>
      ) : view === 'list' ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {shown.map((i) => (
            <li key={i.id}>
              <Row item={i} selected={i.number === selected} canEdit={canEdit} onOpen={() => select(i.number)} onTick={() => move(i, toggledStatus(i.status))} />
            </li>
          ))}
        </ul>
      ) : (
        <Board items={shown} selected={selected} canEdit={canEdit} onOpen={(i) => select(i.number)} onMove={move} />
      )}

      {shown.length > 0 && shown.length < items.length && (
        <p className="text-center text-xs text-muted">{t('shown', { shown: shown.length, total: items.length })}</p>
      )}

      {item && mounted && (
        <ItemDrawer
          key={item.id}
          item={item}
          canEdit={canEdit}
          noteDraft={drafts[item.id] ?? ''}
          onNoteDraft={(value) => setDrafts((d) => ({ ...d, [item.id]: value }))}
          onClose={() => select(null)}
          onCopy={(list) => void copy(list)}
          onCopyLink={(i) => void copyLink(i)}
          onStatus={move}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-xl">
          {toast}
        </div>
      )}

      {json != null && <JsonDialog text={json} onClose={() => setJson(null)} />}
    </div>
  )
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('feedback')
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('search')}
        aria-label={t('searchLabel')}
        className="h-8 w-44 rounded-lg border border-border-strong bg-surface pl-8 pr-2.5 text-[13px] placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring sm:w-56"
      />
    </div>
  )
}

function FilterButton({ filters, setFilters }: { filters: FeedbackFilters; setFilters: (f: FeedbackFilters | ((f: FeedbackFilters) => FeedbackFilters)) => void }) {
  const t = useTranslations('feedback')
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const count = activeFilterCount(filters)
  const choose = <K extends keyof FeedbackFilters>(key: K) => (e: React.ChangeEvent<HTMLSelectElement>) => setFilters((f) => ({ ...f, [key]: e.target.value }))
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={count ? filterOn : btn.outlineSm}>
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {t('filter.button')}
        {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] text-accent-foreground">{count}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={t('filter.title')} width={300}>
        <div className="space-y-3">
          <p className="text-sm font-semibold">{t('filter.title')}</p>
          <FilterSelect label={t('filter.status')} value={filters.status} onChange={choose('status')}>
            <option value="all">{t('filter.all')}</option>
            <option value="open">{t('filter.open')}</option>
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label={t('waitingOn.label')} value={filters.waitingOn} onChange={choose('waitingOn')}>
            <option value="all">{t('filter.all')}</option>
            <option value="none">{t('waitingOn.none')}</option>
            {WAITING_ON.map((w) => (
              <option key={w} value={w}>
                {t(`waitingOn.${w}`)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label={t('source.label')} value={filters.source} onChange={choose('source')}>
            <option value="all">{t('filter.all')}</option>
            {FEEDBACK_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`source.${s}`)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label={t('filter.proposal')} value={filters.proposal} onChange={choose('proposal')}>
            <option value="all">{t('filter.all')}</option>
            <option value="with">{t('filter.withProposal')}</option>
            <option value="without">{t('filter.withoutProposal')}</option>
          </FilterSelect>
          <div className="flex justify-end border-t border-border pt-3">
            <button type="button" disabled={!count} onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, search: f.search, sort: f.sort }))} className={btn.ghost}>
              {t('filter.reset')}
            </button>
          </div>
        </div>
      </Popover>
    </>
  )
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <Select compact value={value} onChange={onChange} className="w-full">
        {children}
      </Select>
    </label>
  )
}

/** What a card or a row says about an item besides its title. */
function Meta({ item }: { item: FeedbackItemDTO }) {
  const t = useTranslations('feedback')
  const format = useFormatter()
  const notes = item.notes.filter((n) => n.choice === 'note').length
  const pictures = item.attachments.filter((a) => a.kind === 'screenshot' || a.kind === 'upload').length
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span className="truncate">{item.author?.name ?? t(`source.${item.source}`)}</span>
      <time dateTime={item.createdAt}>{format.dateTime(new Date(item.createdAt), { day: 'numeric', month: 'short' })}</time>
      {item.page && <span className="max-w-48 truncate font-mono text-[11px]">{item.page}</span>}
      {notes > 0 && (
        <span className="inline-flex items-center gap-1" title={t('notesCount', { count: notes })}>
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          {notes}
        </span>
      )}
      {pictures > 0 && (
        <span className="inline-flex items-center gap-1" title={t('imagesCount', { count: pictures })}>
          <ImageIcon className="h-3.5 w-3.5" aria-hidden />
          {pictures}
        </span>
      )}
      {hasProposal(item) && (
        <span className="inline-flex items-center gap-1 font-medium text-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t('hasProposal')}
        </span>
      )}
    </div>
  )
}

function Tick({ item, onTick }: { item: FeedbackItemDTO; onTick: () => void }) {
  const t = useTranslations('feedback')
  const done = !isOpen(item.status)
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      onClick={(e) => {
        e.stopPropagation()
        onTick()
      }}
      aria-label={done ? t('reopen') : t('markDone')}
      title={done ? t('reopen') : t('markDone')}
      className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border-strong bg-surface hover:border-foreground/40'
      }`}
    >
      {done && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
    </button>
  )
}

function Row({ item, selected, canEdit, onOpen, onTick }: { item: FeedbackItemDTO; selected: boolean; canEdit: boolean; onOpen: () => void; onTick: () => void }) {
  const shot = item.attachments.find((a) => a.kind === 'screenshot' || a.kind === 'upload')
  const done = !isOpen(item.status)
  return (
    <div className={`group relative flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-hover sm:px-5 ${selected ? 'bg-subtle' : ''}`}>
      {canEdit ? <span className="pt-0.5"><Tick item={item} onTick={onTick} /></span> : <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} />}
      <div className="min-w-0 flex-1 space-y-1.5">
        <button type="button" onClick={onOpen} aria-current={selected || undefined} className="block w-full text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
          <span className={`text-sm font-medium leading-snug ${done ? 'text-muted line-through decoration-border-strong' : ''}`}>
            <span className="mr-2 font-normal tabular-nums text-muted no-underline">#{item.number}</span>
            {item.title}
          </span>
        </button>
        <Meta item={item} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.waitingOn && !done && <span className="hidden md:inline-flex"><WaitingChip waitingOn={item.waitingOn} /></span>}
        <StatusPill status={item.status} />
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element -- a protected file the route serves itself
          <img src={shot.url} alt="" loading="lazy" className="hidden h-10 w-16 rounded-md border border-border object-cover object-top sm:block" />
        )}
      </div>
    </div>
  )
}

function Board({ items, selected, canEdit, onOpen, onMove }: { items: FeedbackItemDTO[]; selected: number | null; canEdit: boolean; onOpen: (i: FeedbackItemDTO) => void; onMove: (i: FeedbackItemDTO, s: FeedbackStatus) => void }) {
  const t = useTranslations('feedback')
  const groups = groupByStatus(items)
  const [over, setOver] = useState<FeedbackStatus | null>(null)
  const dragged = useRef<FeedbackItemDTO | null>(null)
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
      {FEEDBACK_STATUSES.map((status) => (
        <section
          key={status}
          aria-label={t(`status.${status}`)}
          onDragOver={(e) => {
            if (!canEdit || !dragged.current) return
            e.preventDefault()
            setOver(status)
          }}
          onDragLeave={() => setOver((o) => (o === status ? null : o))}
          onDrop={(e) => {
            e.preventDefault()
            setOver(null)
            if (dragged.current) onMove(dragged.current, status)
            dragged.current = null
          }}
          className={`flex w-72 shrink-0 flex-col rounded-xl bg-subtle p-2 transition-shadow ${over === status ? 'ring-2 ring-accent' : ''}`}
        >
          <header className="flex items-center gap-2 px-2 pb-2 pt-1">
            <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
            <h2 className="text-sm font-semibold">{t(`status.${status}`)}</h2>
            <span className="text-xs tabular-nums text-muted">{groups[status].length}</span>
          </header>
          <div className="flex min-h-16 flex-col gap-2">
            {groups[status].length ? (
              groups[status].map((i) => (
                <article
                  key={i.id}
                  draggable={canEdit}
                  onDragStart={(e) => {
                    dragged.current = i
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', String(i.number))
                  }}
                  onDragEnd={() => {
                    dragged.current = null
                    setOver(null)
                  }}
                  className={`relative space-y-2 rounded-lg border bg-surface p-3 transition-colors hover:border-border-strong ${i.number === selected ? 'border-accent' : 'border-border'} ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    {canEdit && <Tick item={i} onTick={() => onMove(i, toggledStatus(i.status))} />}
                    <button type="button" onClick={() => onOpen(i)} className="min-w-0 flex-1 text-left text-sm font-medium leading-snug after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
                      <span className="mr-1.5 font-normal tabular-nums text-muted">#{i.number}</span>
                      <span className="line-clamp-3 inline">{i.title}</span>
                    </button>
                  </div>
                  {i.waitingOn && isOpen(i.status) && <WaitingChip waitingOn={i.waitingOn} />}
                  <Meta item={i} />
                </article>
              ))
            ) : (
              <p className="px-2 py-4 text-center text-xs text-muted">{t('emptyColumn')}</p>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

function JsonDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const t = useTranslations('feedback')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.select()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={t('copyDialogTitle')} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold">{t('copyDialogTitle')}</h2>
        <p className="text-sm text-muted">{t('copyDialogHint')}</p>
        <textarea ref={ref} readOnly value={text} className="min-h-72 flex-1 rounded-lg border border-border-strong bg-subtle p-3 font-mono text-xs" />
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={btn.outlineSm}>
            {t('detail.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
