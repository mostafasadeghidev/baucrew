'use client'

/**
 * The card's fields over its back, in a grid the way the client's Trello shows
 * them under the description: the name small above, the value in a box below,
 * three of them on a coloured ground as on the card's front.
 *
 * As in Trello a box is typed into where it stands: the customer's wish, the
 * site visit, the order value and the site's address are saved the moment
 * Enter is pressed or the box is left; the type of work opens the labels
 * window, since the trades are the card's labels. The customer is changed in
 * the project's data, where the address and the phone come along; the
 * customer's number belongs to the customer, the day the card came in to
 * nobody.
 */

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LayoutList } from 'lucide-react'
import { FIELD_CHIP } from '@/components/swatches'
import { CARD_FIELD_TONE, type CardFieldKey } from '@/lib/board-cards'
import { Popover, PopoverHead } from '@/components/ui/popover'
import { btn } from '@/components/ui/button'
import { PROJECT_EDIT_CARD_EVENT, type ProjectSectionKey } from '../project-form'
import { setCardField } from '../actions'
import { CardPanelButton, type CardEditData } from './card-popovers'

export type CardFieldCell = {
  key: CardFieldKey
  /** The value, formatted; null when there is none yet. */
  text: string | null
  /** The project form's card that holds the field; null for what is not the project's to change. */
  section: ProjectSectionKey | null
  /** Where the field is changed instead, when not on the project. */
  href: string | null
  /** Typed into in place: the value as the field takes it. */
  edit?:
    | { kind: 'text' | 'date' | 'number'; value: string }
    | { kind: 'address'; value: { street: string; postalCode: string; city: string } }
    | { kind: 'labels' }
    | null
}

/** On the back the customer's wish has a ground of its own too, as it has in the client's Trello. */
const TONE = { ...CARD_FIELD_TONE, wish: 'red' as const }
const DATES = new Set<CardFieldKey>(['inspection', 'created'])
const SAVE_KEY: Partial<Record<CardFieldKey, 'wish' | 'inspection' | 'price'>> = { wish: 'wish', inspection: 'inspection', value: 'price' }

const INPUT = 'h-9 w-full rounded-md border border-accent bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function CardFieldsGrid({ projectId, cells, card }: { projectId: string; cells: CardFieldCell[]; card: CardEditData }) {
  const t = useTranslations('projects')
  const router = useRouter()

  const open = (cell: CardFieldCell) => {
    if (cell.section) window.dispatchEvent(new CustomEvent(PROJECT_EDIT_CARD_EVENT, { detail: cell.section }))
    else if (cell.href) router.push(cell.href)
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="flex items-center gap-3 text-base font-semibold" title={t('cardFieldsHint')}>
        <LayoutList className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        {t('cardFieldsTitle')}
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2.5 pl-8 sm:grid-cols-3">
        {cells.map((cell) => {
          const tone = TONE[cell.key]
          const ground = tone ? FIELD_CHIP[tone] : 'bg-subtle text-foreground'
          const empty = DATES.has(cell.key) ? t('cardFieldPickDate') : t('cardFieldAdd')
          const box = `flex h-9 w-full items-center rounded-md px-2.5 text-left text-sm transition-[filter] ${ground} ${cell.text ? '' : 'opacity-70'}`
          return (
            <div key={cell.key} className="min-w-0">
              <dt className="truncate text-[11px] font-semibold text-muted">{t(`cardField_${cell.key}`)}</dt>
              <dd className="mt-1">
                {cell.edit?.kind === 'labels' ? (
                  <CardPanelButton data={card} panel="labels" title={t(`cardField_${cell.key}`)} className={`${box} hover:brightness-95 dark:hover:brightness-110`}>
                    <span className="truncate">{cell.text ?? empty}</span>
                  </CardPanelButton>
                ) : cell.edit?.kind === 'address' ? (
                  <AddressField projectId={projectId} value={cell.edit.value} text={cell.text} empty={empty} className={box} />
                ) : cell.edit && SAVE_KEY[cell.key] ? (
                  <InlineField
                    projectId={projectId}
                    saveKey={SAVE_KEY[cell.key]!}
                    kind={cell.edit.kind}
                    value={cell.edit.value}
                    text={cell.text}
                    empty={empty}
                    className={box}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={cell.section === null && cell.href === null}
                    onClick={() => open(cell)}
                    title={cell.text ?? undefined}
                    className={`${box} ${cell.section !== null || cell.href !== null ? 'hover:brightness-95 dark:hover:brightness-110' : 'cursor-default'}`}
                  >
                    <span className="truncate">{cell.text ?? empty}</span>
                  </button>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

/** A box that turns into a field on a click; Enter or leaving it saves, Escape lets go. */
function InlineField({
  projectId,
  saveKey,
  kind,
  value,
  text,
  empty,
  className,
}: {
  projectId: string
  saveKey: 'wish' | 'inspection' | 'price'
  kind: 'text' | 'date' | 'number'
  value: string
  text: string | null
  empty: string
  className: string
}) {
  const tc = useTranslations('common')
  const tp = useTranslations('projects')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)

  const save = () => {
    if (done.current) return
    done.current = true
    setEditing(false)
    if (draft === value) return
    startTransition(async () => {
      const result = await setCardField(projectId, { key: saveKey, value: draft })
      if (result.error) setError(result.error === 'invalidPrice' ? tp('invalidPrice') : tc('saveFailed'))
      router.refresh()
    })
  }

  if (editing)
    return (
      <input
        autoFocus
        type={kind === 'date' ? 'date' : 'text'}
        inputMode={kind === 'number' ? 'decimal' : undefined}
        value={draft}
        maxLength={kind === 'text' ? 200 : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            // The sheet closes on Escape too; here it only lets go of the box.
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation()
            done.current = true
            setEditing(false)
          }
        }}
        onBlur={save}
        className={INPUT}
      />
    )

  return (
    <>
      <button
        type="button"
        title={text ?? undefined}
        onClick={() => {
          done.current = false
          setError(null)
          setDraft(value)
          setEditing(true)
        }}
        className={`${className} hover:brightness-95 dark:hover:brightness-110`}
      >
        <span className="truncate">{text ?? empty}</span>
      </button>
      {error && (
        <p role="alert" className="mt-1 text-[11px] text-danger">
          {error}
        </p>
      )}
    </>
  )
}

/** The site's address: street, postal code and town in a small window. */
function AddressField({
  projectId,
  value,
  text,
  empty,
  className,
}: {
  projectId: string
  value: { street: string; postalCode: string; city: string }
  text: string | null
  empty: string
  className: string
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setError(false)
    startTransition(async () => {
      const result = await setCardField(projectId, { key: 'address', value: draft })
      if (result.error) {
        setError(true)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }
  const field = 'mt-1 block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <>
      <button
        ref={anchor}
        type="button"
        title={text ?? undefined}
        aria-expanded={open}
        onClick={() => {
          setDraft(value)
          setError(false)
          setOpen((o) => !o)
        }}
        className={`${className} hover:brightness-95 dark:hover:brightness-110`}
      >
        <span className="truncate">{text ?? empty}</span>
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={t('cardField_address')}>
        <PopoverHead title={t('cardField_address')} close={close} closeLabel={tc('close')} />
        <form onSubmit={save} className="space-y-2">
          <label className="block text-[11px] font-semibold text-muted">
            {t('street')}
            <input autoFocus value={draft.street} maxLength={300} onChange={(e) => setDraft({ ...draft, street: e.target.value })} className={field} />
          </label>
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
            <label className="block text-[11px] font-semibold text-muted">
              {t('postalCode')}
              <input value={draft.postalCode} maxLength={20} onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })} className={field} />
            </label>
            <label className="block text-[11px] font-semibold text-muted">
              {t('city')}
              <input value={draft.city} maxLength={300} onChange={(e) => setDraft({ ...draft, city: e.target.value })} className={field} />
            </label>
          </div>
          <button type="submit" disabled={pending} className={btn.primarySm}>
            {tc('save')}
          </button>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {tc('saveFailed')}
            </p>
          )}
        </form>
      </Popover>
    </>
  )
}
