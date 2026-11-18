'use client'

/**
 * One window for the boards: every board on the left, dragged into the order
 * their tabs stand in, and the chosen one on the right — its name, its colour
 * and its columns, drawn as a small board while they are changed. Nothing is
 * written until "Speichern"; leaving with changes not saved asks first.
 *
 * A column is a status (src/lib/boards.ts). The window says what each column
 * shows in plain words instead of naming its rule, so "Pause" reads as the
 * running sites that are paused, and a Trello column as the cards of a Trello
 * list. Columns are dragged by their grip, or moved with the arrow keys on it.
 *
 * It opens over the projects page (the gear on the open board's tab, "Neues
 * Board", the board's menu) and stands as the whole of Einstellungen →
 * Boards. Administrators only, as making and deleting boards always was.
 */

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, GripVertical, ImagePlus, LayoutTemplate, Copy, Plus, Rows3, Trash2, X } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Menu, MenuLabel, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { STATUS_STYLES } from '@/components/status-badge'
import { lockPageScroll } from '@/lib/scroll-lock'
import { BOARD_BACKGROUNDS, BOARD_NAME_MAX, COLUMN_TITLE_MAX, boardBackgroundCss, type BoardBackground } from '@/lib/boards'
import { sitesPreset } from '@/lib/board-presets'
import type { ColumnRule } from '@/lib/board-rules'
import { ALL_PROJECT_STATUSES, type ProjectStatusKey } from '@/lib/prep-tab'
import {
  addableColumns,
  blankDraft,
  columnKind,
  copiedColumns,
  draftFromBoard,
  draftFromPreset,
  duplicateColumns,
  moveItem,
  ruleColumn,
  statusColumn,
  type BoardDraft,
  type DraftColumn,
} from '@/lib/board-draft'
import { removeBoard, removeBoardImage, reorderBoards, saveBoardSettings, uploadBoardImage, type BoardImageState } from '../settings/boards/actions'
import { ColumnColorMenu, listGround } from './column-color'

export type SettingsBoard = {
  id: string
  name: string
  background: string | null
  backgroundImage: string | null
  /** Baustellen (/sites) shows this board — one board at most. */
  showOnSites: boolean
  columns: Array<{ id: string; status: string; title: string | null; rule: string | null; color: string | null }>
}

/** Which board the window shows: one of them, or a new one. */
export type BoardChoice = string | 'new'

const FIELD =
  'block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'
const SECTION = 'text-sm font-semibold'
const HINT = 'mt-0.5 text-xs text-muted'
const KEYS = Object.keys(BOARD_BACKGROUNDS) as BoardBackground[]

/** The status's colour as a dot, the way the board's list heads show it. */
function StatusDot({ status }: { status: string }) {
  return (
    <span aria-hidden className={`${STATUS_STYLES[status as ProjectStatusKey] ?? ''} flex h-2 w-2 shrink-0 rounded-full`} style={{ background: 'transparent' }}>
      <span className="block h-2 w-2 rounded-full bg-current" />
    </span>
  )
}

/** A board's colour (or photo) as the round swatch its tab wears. */
function Swatch({ background, image, boardId, size = 'h-2.5 w-2.5' }: { background: string | null; image?: string | null; boardId?: string; size?: string }) {
  const colour = boardBackgroundCss(background)
  const css = image && boardId ? `url(/api/boards/${boardId}/background?v=${encodeURIComponent(image)}) center / cover no-repeat${colour ? `, ${colour}` : ''}` : colour
  return <span aria-hidden className={`${size} shrink-0 rounded-full ${css ? '' : 'border border-border-strong'}`} style={css ? { background: css } : undefined} />
}

/** Rows that can be dragged by their grip, or moved with the arrow keys on it. */
function useDragRows<T>(items: T[], keyOf: (item: T) => string, onMove: (next: T[]) => void, onDropped?: (next: T[]) => void) {
  const [armed, setArmed] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const grips = useRef(new Map<string, HTMLButtonElement>())

  const rowProps = (item: T) => {
    const key = keyOf(item)
    return {
      draggable: armed === key,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', key)
        setDragging(key)
      },
      onDragOver: (e: React.DragEvent) => {
        if (!dragging) return
        e.preventDefault()
        if (dragging === key) return
        const from = items.findIndex((i) => keyOf(i) === dragging)
        const to = items.findIndex((i) => keyOf(i) === key)
        onMove(moveItem(items, from, to))
      },
      onDrop: (e: React.DragEvent) => e.preventDefault(),
      onDragEnd: () => {
        setDragging(null)
        setArmed(null)
        onDropped?.(items)
      },
      'data-dragging': dragging === key ? '' : undefined,
    }
  }
  const gripProps = (item: T) => {
    const key = keyOf(item)
    return {
      ref: (el: HTMLButtonElement | null) => {
        if (el) grips.current.set(key, el)
        else grips.current.delete(key)
      },
      onPointerDown: () => setArmed(key),
      onPointerUp: () => setArmed(null),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        const from = items.findIndex((i) => keyOf(i) === key)
        const next = moveItem(items, from, from + (e.key === 'ArrowUp' ? -1 : 1))
        if (next === items) return
        onMove(next)
        onDropped?.(next)
        // The row moved in the page, and the browser let go of the grip: it is taken up again once it stands.
        requestAnimationFrame(() => grips.current.get(key)?.focus())
      },
    }
  }
  return { rowProps, gripProps, dragging }
}

/**
 * What a column shows, in plain words — the status, or what its rule picks
 * and what dragging a card into it does.
 */
function useColumnWords() {
  const t = useTranslations('projects')
  const tStatus = useTranslations('status')
  const year = new Date().getFullYear() + 1
  return {
    /** The column's name when it has none of its own. */
    fallback: (c: { status: string; rule: string | null }) => {
      const kind = columnKind(c.rule)
      if (kind === 'trello') return t('rule_trello')
      if (kind === 'rule') return t(`rule_${c.rule}` as 'rule_paused', { year })
      return tStatus(c.status as ProjectStatusKey)
    },
    explain: (c: { status: string; rule: string | null }, siblings: string[]) => {
      const kind = columnKind(c.rule)
      if (kind === 'trello') return t('boardSettingsShowsTrello')
      if (kind === 'rule') return t(`boardSettingsShows_${c.rule}` as 'boardSettingsShows_paused', { year })
      const status = tStatus(c.status as ProjectStatusKey)
      return siblings.length > 0
        ? t('boardSettingsShowsStatusRest', { status, lists: siblings.join(', ') })
        : t('boardSettingsShowsStatus', { status })
    },
  }
}

type StartChoice = 'blank' | 'preset' | 'copy'

/** The chosen board on the right of the window: its name, its colour, its columns, and the way to save or delete it. */
function BoardEditor({
  board,
  boards,
  isLast,
  onDirty,
  onSaved,
  onDeleted,
  onCancel,
  closable,
}: {
  board: SettingsBoard | null
  boards: SettingsBoard[]
  isLast: boolean
  onDirty: (dirty: boolean) => void
  onSaved: (id: string, created: boolean) => void
  onDeleted: (id: string) => void
  onCancel: () => void
  /** In the window over the projects page: a cross in the head, which Escape and the dimmed page press too. */
  closable: boolean
}) {
  const t = useTranslations('projects')
  const ts = useTranslations('settings')
  const tc = useTranslations('common')
  const tStatus = useTranslations('status')
  const words = useColumnWords()
  const preset = useMemo(() => sitesPreset(new Date().getFullYear()), [])
  const [draft, setDraft] = useState<BoardDraft>(() => (board ? draftFromBoard(board) : blankDraft()))
  /** The draft as it was opened, or last saved: what "nicht gespeichert" is measured against. */
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft))
  const [start, setStart] = useState<StartChoice>('blank')
  const [copyFrom, setCopyFrom] = useState(boards[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [lit, setLit] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const nameRef = useRef<HTMLInputElement>(null)

  const dirty = JSON.stringify(draft) !== baseline
  useEffect(() => onDirty(dirty), [dirty, onDirty])

  const setColumns = useCallback((columns: DraftColumn[]) => setDraft((d) => ({ ...d, columns })), [])
  const patchColumn = (key: string, patch: Partial<DraftColumn>) =>
    setDraft((d) => ({ ...d, columns: d.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)) }))
  const drag = useDragRows(draft.columns, (c) => c.key, setColumns)

  const twice = duplicateColumns(draft.columns)
  const addable = addableColumns(draft.columns)
  const ready = draft.name.trim() !== '' && draft.columns.length > 0 && twice.size === 0
  /** The board Baustellen shows now, when it is not this one: the tick here takes it over. */
  const sitesElsewhere = boards.find((b) => b.showOnSites && b.id !== board?.id) ?? null

  /** How a new board starts: the usual run of a job, the client's Trello board, or another board's columns. */
  const startWith = (choice: StartChoice, from = copyFrom) => {
    setStart(choice)
    // The ready-made board brings its name, the way a Trello template does; leaving it takes the name along unless it was typed over.
    const typed = (name: string) => (name === preset.name ? '' : name)
    if (choice === 'blank') setDraft((d) => ({ ...blankDraft(), name: typed(d.name) }))
    if (choice === 'preset') setDraft((d) => ({ ...draftFromPreset(preset), name: d.name.trim() ? d.name : preset.name }))
    if (choice === 'copy') {
      const source = boards.find((b) => b.id === from)
      if (source) setDraft((d) => ({ ...d, name: typed(d.name), background: draftFromBoard(source).background, columns: copiedColumns(source.columns) }))
    }
  }

  const save = () => {
    if (!ready) {
      if (!draft.name.trim()) nameRef.current?.focus()
      setError(!draft.name.trim() ? t('boardSettingsError_name') : draft.columns.length === 0 ? t('boardSettingsError_noColumns') : t('boardSettingsError_duplicate'))
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await saveBoardSettings(board?.id ?? null, {
        name: draft.name,
        background: draft.background,
        showOnSites: draft.showOnSites,
        columns: draft.columns.map(({ id, status, title, rule, color }) => ({ id, status, title, rule, color })),
      })
      if (!result.id) {
        const known = ['name', 'noColumns', 'duplicate', 'tooMany'] as const
        const code = known.find((k) => k === result.error)
        setError(code ? t(`boardSettingsError_${code}`) : tc('saveFailed'))
        return
      }
      setBaseline(JSON.stringify(draft))
      onDirty(false)
      onSaved(result.id, board === null)
    })
  }

  const drop = () =>
    startTransition(async () => {
      if (!board) return
      const result = await removeBoard(board.id)
      setAsking(false)
      if (result.error) {
        setError(result.error === 'lastBoard' ? ts('boardOnlyOne') : tc('saveFailed'))
        return
      }
      onDeleted(board.id)
    })

  // Which statuses are split by the rule and Trello columns of the board — said under the plain column of that status.
  const splitOff = (status: string) => draft.columns.filter((c) => c.status === status && c.rule !== null).map((c) => c.title.trim() || words.fallback(c))

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{board ? t('boardSettingsEditTitle', { name: board.name }) : t('boardAdd')}</h2>
        {dirty && <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">{t('boardSettingsUnsaved')}</span>}
        {board && !dirty && (
          <Link href={`/projects?board=${board.id}&view=kanban`} className={`${btn.ghost} shrink-0`}>
            {ts('boardOpen')}
          </Link>
        )}
        {closable && (
          <button
            type="button"
            data-board-settings-close
            onClick={onCancel}
            aria-label={tc('close')}
            title={tc('close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {!board && (
          <fieldset>
            <legend className={SECTION}>{t('boardSettingsStartWith')}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(
                [
                  { key: 'blank', icon: Rows3, title: t('boardSettingsStartBlank'), text: t('boardSettingsStartBlankHint') },
                  { key: 'preset', icon: LayoutTemplate, title: t('boardSettingsStartPreset'), text: t('boardSettingsStartPresetHint', { name: preset.name, count: preset.columns.length }) },
                  { key: 'copy', icon: Copy, title: t('boardSettingsStartCopy'), text: t('boardSettingsStartCopyHint') },
                ] as const
              ).map((option) => {
                const on = start === option.key
                return (
                  <label
                    key={option.key}
                    className={`relative flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${on ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:bg-surface-hover'}`}
                  >
                    <input type="radio" name="board-start" className="sr-only" checked={on} onChange={() => startWith(option.key)} />
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <option.icon className="h-4 w-4 text-muted" aria-hidden />
                      {option.title}
                      {on && <Check className="ml-auto h-4 w-4 text-accent" aria-hidden />}
                    </span>
                    <span className="text-xs text-muted">{option.text}</span>
                    {option.key === 'copy' && on && (
                      <select
                        value={copyFrom}
                        onChange={(e) => {
                          setCopyFrom(e.target.value)
                          startWith('copy', e.target.value)
                        }}
                        aria-label={t('boardSettingsStartCopy')}
                        className={`${FIELD} mt-1 py-1.5`}
                      >
                        {boards.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <label className="block">
            <span className={SECTION}>{t('boardSettingsName')}</span>
            <input
              ref={nameRef}
              autoFocus={!board}
              value={draft.name}
              maxLength={BOARD_NAME_MAX}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={ts('boardNamePlaceholder')}
              className={`${FIELD} mt-1.5`}
            />
          </label>
          <fieldset>
            <legend className={SECTION}>{t('boardSettingsColour')}</legend>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {[null, ...KEYS].map((key) => {
                const on = draft.background === key
                return (
                  <button
                    key={key ?? 'none'}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, background: key }))}
                    aria-pressed={on}
                    aria-label={key ?? ts('boardBackgroundNone')}
                    title={key ?? ts('boardBackgroundNone')}
                    style={key ? { background: BOARD_BACKGROUNDS[key] } : undefined}
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface transition-shadow ${on ? 'ring-2 ring-accent' : 'hover:ring-2 hover:ring-border-strong'} ${key ? '' : 'border border-dashed border-border-strong bg-surface text-muted'}`}
                  >
                    {on && <Check className="h-3.5 w-3.5 drop-shadow" aria-hidden />}
                  </button>
                )
              })}
            </div>
            <p className={HINT}>{t('boardSettingsColourHint')}</p>
            {board && <BoardPhoto board={board} />}
          </fieldset>
        </div>

        {/* Baustellen shows one board — the running jobs — in the same board view. */}
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={draft.showOnSites}
            onChange={(e) => setDraft((d) => ({ ...d, showOnSites: e.target.checked }))}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-accent"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{t('boardSettingsShowOnSites')}</span>
            <span className={HINT + ' block'}>
              {sitesElsewhere && draft.showOnSites
                ? t('boardSettingsShowOnSitesMoves', { name: sitesElsewhere.name })
                : sitesElsewhere
                  ? t('boardSettingsShowOnSitesOther', { name: sitesElsewhere.name })
                  : t('boardSettingsShowOnSitesHint')}
            </span>
          </span>
        </label>

        {/* The draft as the board will look: its tab, and its columns left to right. */}
        <section aria-label={t('boardSettingsPreview')}>
          <h3 className={SECTION}>{t('boardSettingsPreview')}</h3>
          <div className="mt-1.5 rounded-lg border border-border bg-background p-3">
            <div className="mb-2.5 inline-flex max-w-full items-center gap-1.5 rounded-md bg-subtle px-2 py-1 text-xs font-medium">
              <Swatch background={draft.background} image={board?.backgroundImage} boardId={board?.id} />
              <span className="truncate">{draft.name.trim() || ts('boardNamePlaceholder')}</span>
            </div>
            <ol className="flex gap-2 overflow-x-auto pb-1">
              {draft.columns.length === 0 && <li className="h-20 w-28 shrink-0 rounded-md border border-dashed border-border-strong" />}
              {draft.columns.map((c) => (
                <li
                  key={c.key}
                  className={`w-32 shrink-0 rounded-md p-1.5 transition-shadow ${listGround(c.color)} ${lit === c.key ? 'ring-2 ring-accent' : ''} ${twice.has(c.key) ? 'ring-2 ring-danger' : ''}`}
                >
                  <div className="flex items-center gap-1.5 px-0.5 text-[11px] font-semibold">
                    <StatusDot status={c.status} />
                    <span className="truncate">{c.title.trim() || words.fallback(c)}</span>
                  </div>
                  <div className="mt-1.5 h-5 rounded border border-border bg-surface" />
                  <div className="mt-1 h-5 w-3/4 rounded border border-border bg-surface" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="board-settings-columns">
          <h3 id="board-settings-columns" className={SECTION}>
            {t('boardSettingsColumns')} <span className="font-normal text-muted">· {draft.columns.length}</span>
          </h3>
          <p className={HINT}>{t('boardSettingsColumnsHint')}</p>
          <ol className="mt-3 space-y-1.5">
            {draft.columns.map((c, index) => {
              const kind = columnKind(c.rule)
              const repeated = twice.has(c.key)
              return (
                <li
                  key={c.key}
                  {...drag.rowProps(c)}
                  onMouseEnter={() => setLit(c.key)}
                  onMouseLeave={() => setLit((k) => (k === c.key ? null : k))}
                  onFocus={() => setLit(c.key)}
                  className={`group flex items-start gap-2 rounded-lg border bg-surface p-2 data-[dragging]:opacity-50 ${repeated ? 'border-danger' : 'border-border'}`}
                >
                  <button
                    type="button"
                    {...drag.gripProps(c)}
                    aria-label={t('boardSettingsColumnMove', { name: c.title.trim() || words.fallback(c), position: index + 1, count: draft.columns.length })}
                    title={t('boardSettingsColumnMoveHint')}
                    className="mt-1 flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" aria-hidden />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={c.title}
                        maxLength={COLUMN_TITLE_MAX}
                        onChange={(e) => patchColumn(c.key, { title: e.target.value })}
                        placeholder={words.fallback(c)}
                        aria-label={t('boardSettingsColumnName', { position: index + 1 })}
                        className={`${FIELD} h-8 min-w-40 flex-1 py-1`}
                      />
                      {kind === 'rule' ? (
                        <span className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs`}>
                          <StatusDot status={c.status} />
                          {tStatus(c.status)}
                          <span className="rounded-full bg-subtle px-1.5 py-px text-[10px] text-muted">{t('boardSettingsKindRule')}</span>
                        </span>
                      ) : (
                        <label className="relative inline-flex shrink-0 items-center">
                          <span className="pointer-events-none absolute left-2.5">
                            <StatusDot status={c.status} />
                          </span>
                          <select
                            value={c.status}
                            onChange={(e) => patchColumn(c.key, { status: e.target.value as ProjectStatusKey })}
                            aria-label={t('boardSettingsColumnStatus', { position: index + 1 })}
                            className="h-8 rounded-lg border border-border-strong bg-surface py-0 pl-6 pr-7 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            {ALL_PROJECT_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {tStatus(s)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <ColumnColorMenu value={c.color} onPick={(color) => patchColumn(c.key, { color })} name={c.title.trim() || words.fallback(c)} />
                      {kind === 'trello' && <span className="rounded-full bg-subtle px-1.5 py-px text-[10px] text-muted">Trello</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted">{words.explain(c, kind === 'status' ? splitOff(c.status) : [])}</p>
                    {kind === 'trello' && <p className="mt-0.5 text-xs text-muted">{t('boardSettingsTrelloNote')}</p>}
                    {repeated && (
                      <p role="alert" className="mt-0.5 text-xs text-danger">
                        {t('boardSettingsDuplicate')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setColumns(draft.columns.filter((x) => x.key !== c.key))}
                    aria-label={t('boardSettingsColumnRemove', { name: c.title.trim() || words.fallback(c) })}
                    title={t('boardSettingsColumnRemoveHint')}
                    className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ol>
          {draft.columns.length === 0 && (
            <p className="mt-3 rounded-lg border border-dashed border-border-strong p-4 text-center text-sm text-muted">{t('boardSettingsError_noColumns')}</p>
          )}
          {/* A new column stands at the right end of the board, so it is added at the foot of the list. */}
          <div className="mt-2">
            <AddColumnMenu statuses={addable.statuses} rules={addable.rules} onAdd={(column) => setColumns([...draft.columns, column])} />
          </div>
        </section>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-3">
        {board &&
          (isLast ? (
            <span className="text-xs text-muted">{ts('boardOnlyOne')}</span>
          ) : (
            <button type="button" onClick={() => setAsking(true)} disabled={pending} className={`${btn.ghost} text-danger hover:bg-danger/10 hover:text-danger`}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {t('boardSettingsDelete')}
            </button>
          ))}
        <div className="ml-auto flex items-center gap-2">
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <button type="button" onClick={onCancel} className={btn.outline}>
            {tc('cancel')}
          </button>
          <button type="button" onClick={save} disabled={pending || (board !== null && !dirty)} className={btn.primary}>
            {board ? tc('save') : t('boardAdd')}
          </button>
        </div>
      </div>

      <AlertDialog
        open={asking}
        title={t('boardSettingsDeleteTitle', { name: board?.name ?? '' })}
        description={t('boardSettingsDeleteText')}
        confirmLabel={t('boardSettingsDelete')}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onConfirm={drop}
        onCancel={() => setAsking(false)}
      />
    </div>
  )
}

/** "Spalte hinzufügen": a column for a status, or one of the lists that fill by a rule — each said in plain words. */
function AddColumnMenu({ statuses, rules, onAdd }: { statuses: ProjectStatusKey[]; rules: ColumnRule[]; onAdd: (column: DraftColumn) => void }) {
  const t = useTranslations('projects')
  const tStatus = useTranslations('status')
  const year = new Date().getFullYear() + 1
  return (
    <Menu
      // It stands at the foot of the list, near the window's lower edge: it opens upwards.
      side="top"
      label={t('boardSettingsAddColumn')}
      className={btn.outlineSm}
      trigger={
        <>
          <Plus className="h-4 w-4" aria-hidden />
          {t('boardSettingsAddColumn')}
        </>
      }
    >
      {statuses.length === 0 && rules.length === 0 && <p className="px-2 py-1.5 text-sm text-muted">{t('boardSettingsNothingToAdd')}</p>}
      {statuses.length > 0 && <MenuLabel>{t('boardSettingsAddStatus')}</MenuLabel>}
      {statuses.map((status) => (
        <button key={status} type="button" role="menuitem" className={menuItemClass} onClick={() => onAdd(statusColumn(status))}>
          <StatusDot status={status} />
          {tStatus(status)}
        </button>
      ))}
      {rules.length > 0 && (
        <>
          {statuses.length > 0 && <MenuSeparator />}
          <MenuLabel>{t('boardSettingsAddRule')}</MenuLabel>
          {rules.map((rule) => (
            <button key={rule} type="button" role="menuitem" className={`${menuItemClass} max-w-80 items-start`} onClick={() => onAdd(ruleColumn(rule))}>
              <span className="min-w-0">
                <span className="block">{t(`rule_${rule}` as 'rule_paused', { year })}</span>
                <span className="block whitespace-normal text-xs text-muted">{t(`boardSettingsShows_${rule}` as 'boardSettingsShows_paused', { year })}</span>
              </span>
            </button>
          ))}
        </>
      )}
    </Menu>
  )
}

/** A photo in the tab's swatch instead of the colour — sent the moment it is chosen, not with the rest. */
function BoardPhoto({ board }: { board: SettingsBoard }) {
  const ts = useTranslations('settings')
  const tc = useTranslations('common')
  const [state, upload, uploading] = useActionState<BoardImageState, FormData>(uploadBoardImage.bind(null, board.id), {})
  const [removing, startRemove] = useTransition()
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {board.backgroundImage && <Swatch background={board.background} image={board.backgroundImage} boardId={board.id} size="h-6 w-6" />}
      <form action={upload}>
        <label className={`inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-accent hover:underline ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          {ts('boardImageUpload')}
          <input type="file" name="image" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
        </label>
      </form>
      {board.backgroundImage && (
        <button type="button" disabled={removing} onClick={() => startRemove(() => removeBoardImage(board.id))} className="text-xs text-muted hover:text-foreground hover:underline">
          {ts('boardImageRemove')}
        </button>
      )}
      {state.error && (
        <p role="alert" className="w-full text-xs text-danger">
          {state.error === 'invalidType' ? ts('boardImageInvalidType') : state.error === 'tooLarge' ? ts('boardImageTooLarge') : tc('saveFailed')}
        </p>
      )}
    </div>
  )
}

/**
 * The boards on the left — dragged into the order of their tabs, saved on the
 * drop — and the chosen one on the right.
 */
export function BoardManager({
  boards,
  initial,
  onClose,
  onCreated,
  onDeleted,
}: {
  boards: SettingsBoard[]
  initial: BoardChoice
  /** Cancel, or done: the window closes; on the settings page the draft goes back to what is saved. */
  onClose?: () => void
  /** A board was made: the window opens it; the settings page shows it. */
  onCreated?: (id: string) => void
  /** A board was deleted: the window leaves it. */
  onDeleted?: (id: string) => void
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [selected, setSelected] = useState<BoardChoice>(initial === 'new' || boards.some((b) => b.id === initial) ? initial : (boards[0]?.id ?? 'new'))
  const [order, setOrder] = useState(boards)
  const [shown, setShown] = useState(boards)
  // The boards as the server has them now replace the dragged order once they arrive.
  if (shown !== boards) {
    setShown(boards)
    setOrder(boards)
  }
  const [dirty, setDirty] = useState(false)
  const [revision, setRevision] = useState(0)
  /** What waits for "Verwerfen" while the open board has changes not saved. */
  const [leaving, setLeaving] = useState<(() => void) | null>(null)
  const guard = (then: () => void) => (dirty ? setLeaving(() => then) : then())

  const drag = useDragRows(order, (b) => b.id, setOrder, (next) => {
    if (next.map((b) => b.id).join() === boards.map((b) => b.id).join()) return
    void reorderBoards(next.map((b) => b.id)).then(() => router.refresh())
  })
  const board = selected === 'new' ? null : (boards.find((b) => b.id === selected) ?? null)
  const cancel = () => {
    if (onClose) guard(onClose)
    else guard(() => setRevision((r) => r + 1))
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col md:flex-row">
      {/* On a narrow screen the list of boards folds into a choice above the board. */}
      <div className="shrink-0 border-b border-border p-2 md:hidden">
        <select
          value={selected}
          onChange={(e) => {
            const next = e.target.value
            guard(() => setSelected(next))
          }}
          aria-label={t('boardsManage')}
          className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm"
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value="new">+ {t('boardNew')}</option>
        </select>
      </div>
      <nav aria-label={t('boardTabs')} className="hidden w-64 shrink-0 flex-col border-r border-border bg-background/60 md:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
          <h2 className="text-base font-semibold">{t('boardsManage')}</h2>
        </div>
        <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {order.map((b, index) => {
            const on = b.id === selected
            return (
              <li key={b.id} {...drag.rowProps(b)} className="group flex items-center rounded-md data-[dragging]:opacity-50">
                <button
                  type="button"
                  {...drag.gripProps(b)}
                  aria-label={t('boardSettingsBoardMove', { name: b.name, position: index + 1, count: order.length })}
                  title={t('boardSettingsColumnMoveHint')}
                  className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover:opacity-100"
                >
                  <GripVertical className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  onClick={() => b.id !== selected && guard(() => setSelected(b.id))}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${on ? 'bg-subtle font-medium' : 'hover:bg-surface-hover'}`}
                >
                  <Swatch background={b.background} image={b.backgroundImage} boardId={b.id} />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  <span className="shrink-0 text-xs text-muted">{b.columns.length}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <div className="shrink-0 border-t border-border p-2">
          <button
            type="button"
            onClick={() => selected !== 'new' && guard(() => setSelected('new'))}
            aria-current={selected === 'new' ? 'true' : undefined}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-accent ${selected === 'new' ? 'bg-subtle' : 'hover:bg-surface-hover'}`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('boardNew')}
          </button>
          <p className="mt-1 px-2 text-[11px] text-muted">{t('boardSettingsDragHint')}</p>
        </div>
      </nav>
      <BoardEditor
        // A fresh draft for another board, for a board saved anew, and after "Abbrechen" on the settings page.
        key={`${selected}:${revision}:${board ? JSON.stringify(board) : ''}`}
        board={board}
        boards={boards}
        isLast={boards.length <= 1}
        onDirty={setDirty}
        onSaved={(id, created) => {
          setDirty(false)
          if (created) {
            if (onCreated) onCreated(id)
            else setSelected(id)
          } else if (onClose) onClose()
          router.refresh()
        }}
        onDeleted={(id) => {
          setDirty(false)
          setSelected(boards.find((b) => b.id !== id)?.id ?? 'new')
          onDeleted?.(id)
          router.refresh()
        }}
        onCancel={cancel}
        closable={onClose !== undefined}
      />
      <AlertDialog
        open={leaving !== null}
        title={t('boardSettingsDiscardTitle')}
        description={t('boardSettingsDiscardText')}
        confirmLabel={t('boardSettingsDiscard')}
        cancelLabel={tc('cancel')}
        destructive
        onConfirm={() => {
          const then = leaving
          setLeaving(null)
          setDirty(false)
          then?.()
        }}
        onCancel={() => setLeaving(null)}
      />
    </div>
  )
}

/** Which board's settings stand open over the projects page: in the address, so the board's menus can open them too. */
export const BOARD_SETTINGS_PARAM = 'boardSettings'

/** Opens the window over the projects page without asking the server for the page again. */
export function openBoardSettings(choice: BoardChoice) {
  const url = new URL(window.location.href)
  url.searchParams.set(BOARD_SETTINGS_PARAM, choice)
  window.history.replaceState(null, '', url)
}

export function closeBoardSettings() {
  const url = new URL(window.location.href)
  url.searchParams.delete(BOARD_SETTINGS_PARAM)
  window.history.replaceState(null, '', url)
}

/** Escape and the dimmed page close the window the way its cross does — through the question when something is not saved. */
const pressClose = () => document.querySelector<HTMLButtonElement>('[data-board-settings-close]')?.click()

/** The manager as a window over the projects page. */
export function BoardSettingsDialog({
  boards,
  initial,
  onClose,
  onCreated,
  onDeleted,
}: {
  boards: SettingsBoard[]
  initial: BoardChoice
  onClose: () => void
  onCreated: (id: string) => void
  onDeleted?: (id: string) => void
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  useEffect(() => lockPageScroll(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // A menu or a question over the window closes first.
      if (document.querySelector('[role="menu"], [role="alertdialog"]')) return
      e.preventDefault()
      pressClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-6">
      <button type="button" tabIndex={-1} aria-label={tc('close')} onClick={pressClose} className="absolute inset-0 bg-black/40" />
      <div role="dialog" aria-modal="true" aria-label={t('boardsManage')} className="relative flex h-[min(52rem,100%)] w-full max-w-6xl overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <BoardManager
          boards={boards}
          initial={initial}
          onClose={onClose}
          onCreated={onCreated}
          onDeleted={onDeleted}
        />
      </div>
    </div>,
    document.body
  )
}
