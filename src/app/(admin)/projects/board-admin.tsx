'use client'

/**
 * Boards made and changed where they stand, the way Trello does it: the "+"
 * after the tabs opens a small window to make one — its title, its ground and
 * the lists it starts with — and the arrow on the open tab one to change it:
 * the title, the colour or a photo, its place among the tabs, or away with it.
 * The lists themselves are added, renamed and moved on the board, as ever;
 * the settings page stays for the rest. Administrators only, as there.
 */

import { useActionState, useCallback, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { Popover, PopoverHead } from '@/components/ui/popover'
import { btn } from '@/components/ui/button'
import { BOARD_BACKGROUNDS, BOARD_NAME_MAX, type BoardBackground } from '@/lib/boards'
import { ALL_PROJECT_STATUSES, type ProjectStatusKey } from '@/lib/prep-tab'
import { STATUS_STYLES } from '@/components/status-badge'
import {
  createBoardFromBar,
  moveBoard,
  removeBoard,
  removeBoardImage,
  renameBoard,
  setBoardBackground,
  uploadBoardImage,
  type BoardImageState,
} from '../settings/boards/actions'
import { rememberBoard } from './actions'

export type ManagedBoard = { id: string; name: string; background: string | null; backgroundImage: string | null }

const FIELD =
  'block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'
const HEAD = 'mb-1.5 mt-3 block text-[11px] font-semibold text-muted'
const KEYS = Object.keys(BOARD_BACKGROUNDS) as BoardBackground[]
/** The heights of the little lists in the preview, one per list the board will have. */
const PREVIEW = [0.9, 0.6, 0.75, 0.5, 0.85, 0.65]

/** The grounds as Trello shows them: a row of small tiles, the chosen one ticked; the first is none. */
function Swatches({ value, onPick, noneLabel }: { value: string | null; onPick: (key: string | null) => void; noneLabel: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {[null, ...KEYS].map((key) => {
        const on = value === key
        return (
          <button
            key={key ?? 'none'}
            type="button"
            onClick={() => onPick(key)}
            aria-pressed={on}
            title={key ?? noneLabel}
            aria-label={key ?? noneLabel}
            style={key ? { background: BOARD_BACKGROUNDS[key] } : undefined}
            className={`flex h-7 w-9 items-center justify-center rounded ring-offset-2 ring-offset-surface transition-shadow hover:brightness-110 ${
              on ? 'ring-2 ring-accent' : ''
            } ${key ? 'text-white' : 'border border-dashed border-border bg-background text-[10px] text-muted'}`}
          >
            {key ? on && <Check className="h-4 w-4 drop-shadow" aria-hidden /> : noneLabel}
          </button>
        )
      })}
    </div>
  )
}

/** The "+" after the tabs: a new board, opened as soon as it is made. */
export function NewBoardButton({
  boards,
  presets,
  onGround,
  openHref,
}: {
  boards: ManagedBoard[]
  /** The ready-made boards on offer — the client's Trello board. */
  presets: Array<{ key: string; name: string; background: string }>
  onGround: boolean
  /** Where a board is opened, keeping the rest of the address. */
  openHref: (id: string) => string
}) {
  const t = useTranslations('projects')
  const ts = useTranslations('settings')
  const tc = useTranslations('common')
  const tStatus = useTranslations('status')
  const router = useRouter()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [background, setBackground] = useState<string | null>('blue')
  /** `pick` while the statuses are ticked one by one; else a preset or a board to copy. */
  const [lists, setLists] = useState('pick')
  const [picked, setPicked] = useState<ProjectStatusKey[]>([])
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()
  const close = useCallback(() => setOpen(false), [])

  const pickLists = (value: string) => {
    setLists(value)
    // A ready-made board brings its own name and ground, as a Trello template does, unless a name was typed.
    const preset = presets.find((p) => `preset:${p.key}` === value)
    if (preset) {
      if (!name.trim()) setName(preset.name)
      setBackground(preset.background)
    }
  }

  const toggle = (status: ProjectStatusKey) =>
    setPicked((now) => (now.includes(status) ? now.filter((s) => s !== status) : [...now, status]))
  const everyStatus = picked.length === ALL_PROJECT_STATUSES.length
  const ready = name.trim() !== '' && (lists !== 'pick' || picked.length > 0)

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setError(false)
    startTransition(async () => {
      // The ticked statuses in the order of the lifecycle; the board's own order is dragged afterwards.
      const start = lists === 'pick' ? `pick:${ALL_PROJECT_STATUSES.filter((s) => picked.includes(s)).join(',')}` : lists
      const result = await createBoardFromBar({ name, background, lists: start })
      if (!result.id) {
        setError(true)
        return
      }
      await rememberBoard(result.id)
      setOpen(false)
      setName('')
      setLists('pick')
      setPicked([])
      router.push(openHref(result.id))
    })
  }

  const ground = background ? BOARD_BACKGROUNDS[background as BoardBackground] : undefined
  // As many little lists as the board will start with, the way the choice stands.
  const bars = lists === 'pick' ? Math.min(picked.length, PREVIEW.length) : 4

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('boardAdd')}
        aria-label={t('boardAdd')}
        aria-expanded={open}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
          onGround ? 'text-white hover:bg-white/25' : 'text-muted hover:bg-surface-hover hover:text-foreground'
        }`}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={t('boardAdd')}>
        <PopoverHead title={t('boardAdd')} close={close} closeLabel={tc('close')} />
        {/* A small board on the chosen ground, the way Trello previews one. */}
        <div
          aria-hidden
          style={ground ? { background: ground } : undefined}
          className={`flex h-20 items-start justify-center gap-1.5 rounded-md pt-3 ${ground ? '' : 'border border-border bg-subtle'}`}
        >
          {bars === 0 ? (
            <span className="h-9 w-12 rounded border border-dashed border-white/80" />
          ) : (
            PREVIEW.slice(0, bars).map((h, i) => (
              <span key={i} className="w-8 rounded bg-white/80 shadow-sm" style={{ height: `${h * 3.5}rem` }} />
            ))
          )}
        </div>
        <form onSubmit={create}>
          <span className={HEAD}>{ts('boardBackground')}</span>
          <Swatches value={background} onPick={setBackground} noneLabel={ts('boardBackgroundNone')} />
          <label className={HEAD} htmlFor="new-board-name">
            {t('boardTitleLabel')} <span className="text-danger">*</span>
          </label>
          <input
            id="new-board-name"
            autoFocus
            required
            value={name}
            maxLength={BOARD_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder={ts('boardNamePlaceholder')}
            className={FIELD}
          />
          <label className={HEAD} htmlFor="new-board-lists">
            {t('boardListsLabel')}
          </label>
          <select id="new-board-lists" value={lists} onChange={(e) => pickLists(e.target.value)} className={FIELD}>
            <option value="pick">{t('boardListsPick')}</option>
            {presets.map((p) => (
              <option key={p.key} value={`preset:${p.key}`}>
                {t('boardListsPreset', { name: p.name })}
              </option>
            ))}
            {boards.map((b) => (
              <option key={b.id} value={`copy:${b.id}`}>
                {t('boardListsCopy', { name: b.name })}
              </option>
            ))}
          </select>
          {lists === 'pick' && (
            // The statuses one by one, as many as wanted: each ticked one becomes a list.
            <fieldset className="mt-2">
              <legend className="sr-only">{t('boardListsPick')}</legend>
              <div className="grid grid-cols-2 gap-x-1 gap-y-0.5">
                {ALL_PROJECT_STATUSES.map((status) => (
                  <label key={status} className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 hover:bg-surface-hover">
                    <input
                      type="checkbox"
                      checked={picked.includes(status)}
                      onChange={() => toggle(status)}
                      className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span className={`min-w-0 truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status]}`}>{tStatus(status)}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPicked(everyStatus ? [] : [...ALL_PROJECT_STATUSES])}
                className="mt-1 px-1 text-[11px] font-medium text-accent hover:underline"
              >
                {everyStatus ? t('boardListsPickNone') : t('boardListsPickAll')}
              </button>
            </fieldset>
          )}
          <p className="mt-1 text-[11px] text-muted">{t('boardListsHint')}</p>
          <button type="submit" disabled={pending || !ready} className={`${btn.primarySm} mt-3 w-full`}>
            {t('boardCreateButton')}
          </button>
          {error && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {tc('saveFailed')}
            </p>
          )}
        </form>
      </Popover>
    </>
  )
}

/** The arrow on the open tab: the board's title, its ground, its place, or away with it. */
export function EditBoardButton({
  board,
  index,
  count,
  onGround,
  leaveHref,
}: {
  board: ManagedBoard
  /** Where its tab stands among the others, and how many there are. */
  index: number
  count: number
  onGround: boolean
  /** Where the page goes once this board is gone. */
  leaveHref: string
}) {
  const t = useTranslations('projects')
  const ts = useTranslations('settings')
  const tc = useTranslations('common')
  const router = useRouter()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(board.name)
  const [background, setBackground] = useState(board.background)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [image, uploadAction, uploading] = useActionState<BoardImageState, FormData>(uploadBoardImage.bind(null, board.id), {})
  const close = useCallback(() => {
    setOpen(false)
    setAsking(false)
  }, [])

  const run = (task: () => Promise<{ error?: string } | void>) => {
    setError(null)
    startTransition(async () => {
      const result = await task()
      if (result && result.error) setError(result.error === 'lastBoard' ? ts('boardOnlyOne') : tc('saveFailed'))
    })
  }
  const saveName = () => {
    const next = name.trim()
    if (!next) {
      setName(board.name)
      return
    }
    if (next !== board.name) run(() => renameBoard(board.id, next))
  }
  const pickBackground = (key: string | null) => {
    setBackground(key)
    run(() => setBoardBackground(board.id, key))
  }
  const drop = () => {
    setError(null)
    startTransition(async () => {
      const result = await removeBoard(board.id)
      if (result.error) {
        setError(result.error === 'lastBoard' ? ts('boardOnlyOne') : tc('saveFailed'))
        return
      }
      setOpen(false)
      router.replace(leaveHref)
    })
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => {
          setName(board.name)
          setBackground(board.background)
          setError(null)
          setAsking(false)
          setOpen((o) => !o)
        }}
        title={t('boardEdit')}
        aria-label={`${t('boardEdit')}: ${board.name}`}
        aria-expanded={open}
        className={`-ml-1 mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
          onGround ? 'text-neutral-700 hover:bg-black/10' : 'text-muted hover:bg-surface-hover hover:text-foreground'
        }`}
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={t('boardEdit')}>
        <PopoverHead title={t('boardEdit')} close={close} closeLabel={tc('close')} />
        <label className="mb-1.5 block text-[11px] font-semibold text-muted" htmlFor={`board-name-${board.id}`}>
          {t('boardTitleLabel')}
        </label>
        <input
          id={`board-name-${board.id}`}
          value={name}
          maxLength={BOARD_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              saveName()
            }
          }}
          onBlur={saveName}
          className={FIELD}
        />

        <span className={HEAD}>{ts('boardBackground')}</span>
        <Swatches value={background} onPick={pickBackground} noneLabel={ts('boardBackgroundNone')} />

        <span className={HEAD}>{ts('boardImage')}</span>
        <div className="flex flex-wrap items-center gap-2">
          {board.backgroundImage && (
            // The board's own photo, served by the app; next/image has nothing to optimise here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/boards/${board.id}/background?v=${encodeURIComponent(board.backgroundImage)}`}
              alt=""
              className="h-9 w-14 rounded object-cover"
            />
          )}
          <form action={uploadAction}>
            {/* The file is sent the moment it is chosen. */}
            <label className={`${btn.outlineSm} cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              {ts('boardImageUpload')}
              <input
                type="file"
                name="image"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              />
            </label>
          </form>
          {board.backgroundImage && (
            <button type="button" disabled={pending} onClick={() => run(() => removeBoardImage(board.id))} className={btn.outlineSm}>
              {ts('boardImageRemove')}
            </button>
          )}
        </div>
        {image.error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {image.error === 'invalidType' ? ts('boardImageInvalidType') : image.error === 'tooLarge' ? ts('boardImageTooLarge') : tc('saveFailed')}
          </p>
        )}

        <span className={HEAD}>{t('boardPlace')}</span>
        <div className="flex gap-2">
          <button type="button" disabled={pending || index === 0} onClick={() => run(() => moveBoard(board.id, -1))} className={`${btn.outlineSm} flex-1`}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t('boardMoveLeft')}
          </button>
          <button
            type="button"
            disabled={pending || index === count - 1}
            onClick={() => run(() => moveBoard(board.id, 1))}
            className={`${btn.outlineSm} flex-1`}
          >
            {t('boardMoveRight')}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="mt-3 border-t border-border pt-3">
          {count <= 1 ? (
            <p className="text-xs text-muted">{ts('boardOnlyOne')}</p>
          ) : asking ? (
            <div className="space-y-2">
              <p className="text-sm">{ts('boardDeleteConfirm', { name: board.name })}</p>
              <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={drop} className={`${btn.dangerSm} flex-1`}>
                  {tc('delete')}
                </button>
                <button type="button" onClick={() => setAsking(false)} className={`${btn.outlineSm} flex-1`}>
                  {tc('cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
              {t('boardDelete')}
            </button>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          )}
          <Link href="/settings/boards" onClick={close} className="mt-2 block px-2 text-xs text-muted hover:text-foreground hover:underline">
            {t('boardMoreSettings')}
          </Link>
        </div>
      </Popover>
    </>
  )
}
