'use client'

/**
 * The card's fields over its back, in a grid the way the client's Trello shows
 * them under the description: the name small above, the value in a box below,
 * three of them on a coloured ground as on the card's front.
 *
 * As in Trello a box is typed into where it stands: the customer's wish, the
 * site visit, the order value and the site's address are saved the moment
 * Enter is pressed or the box is left; the type of work opens the labels
 * window, since the trades are the card's labels. The customer is picked in a
 * small window from a list searched as it is typed into, or made new there;
 * the customer's number belongs to the customer, the day the card came in to
 * nobody.
 */

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, LayoutList, Plus } from 'lucide-react'
import { FIELD_CHIP } from '@/components/swatches'
import { CARD_FIELD_TONE, type CardFieldKey } from '@/lib/board-cards'
import { Popover, PopoverHead } from '@/components/ui/popover'
import { btn } from '@/components/ui/button'
import { PROJECT_EDIT_CARD_EVENT, type ProjectSectionKey } from '../project-form'
import { NewCustomerModal } from '../new-customer-modal'
import { CityPicker } from '@/components/city-picker'
import { setCardField } from '../actions'
import { CardPanelButton, type CardEditData } from './card-popovers'

/** The site's address as the card's window changes it; the place found for the town rides along, for the map and the weather. */
export type CardAddress = { street: string; postalCode: string; city: string; latitude: number | null; longitude: number | null }

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
    | { kind: 'address'; value: CardAddress }
    | { kind: 'labels' }
    | { kind: 'customer'; value: string; options: { value: string; label: string }[]; canCreate: boolean }
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
                ) : cell.edit?.kind === 'customer' ? (
                  <CustomerField
                    projectId={projectId}
                    value={cell.edit.value}
                    options={cell.edit.options}
                    canCreate={cell.edit.canCreate}
                    text={cell.text}
                    empty={empty}
                    className={box}
                  />
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

/**
 * The site's address: street, postal code and town in a small window. The
 * town is the form's town picker — a list of places while it is typed, and a
 * line saying whether the place was found, since only a found place has a
 * weather forecast and a pin on the map.
 */
function AddressField({
  projectId,
  value,
  text,
  empty,
  className,
}: {
  projectId: string
  value: CardAddress
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

  const store = () => {
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
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    store()
  }
  const changed =
    draft.street !== value.street || draft.postalCode !== value.postalCode || draft.city !== value.city || draft.latitude !== value.latitude
  // Left by a click beside it, the window keeps what was typed, as a box on
  // the card does when it is left; Escape and the cross let it go.
  const close = (how?: unknown) => {
    if (how === 'outside' && changed && !pending) store()
    else setOpen(false)
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
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-2">
            <label className="block text-[11px] font-semibold text-muted">
              {t('postalCode')}
              <input value={draft.postalCode} maxLength={20} onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })} className={field} />
            </label>
            <CityPicker
              label={t('city')}
              value={draft}
              onChange={(place) => setDraft((d) => ({ ...d, ...place }))}
              onPostcode={(code, replaces) => setDraft((d) => (!d.postalCode || d.postalCode === replaces ? { ...d, postalCode: code } : d))}
              labelClassName="block text-[11px] font-semibold text-muted"
              inputClassName={field}
            />
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

const SEARCH = 'block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'
/** How many customers the list draws at once; the search narrows the rest. */
const CUSTOMERS_SHOWN = 50

/**
 * The customer, picked the way Trello picks from a list: a small window, a
 * search that narrows the list as it is typed into, a click that saves. A
 * customer not in the list yet is made new from there and taken at once.
 */
function CustomerField({
  projectId,
  value,
  options,
  canCreate,
  text,
  empty,
  className,
}: {
  projectId: string
  value: string
  options: { value: string; label: string }[]
  /** A customer made new from here is the office's; a site manager picks from the list. */
  canCreate: boolean
  text: string | null
  empty: string
  className: string
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const tCustomers = useTranslations('customers')
  const router = useRouter()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  /** The name typed so far while a new customer is being made; null while none is. */
  const [making, setMaking] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  const pick = (id: string) => {
    setOpen(false)
    if (id === value) return
    setError(false)
    startTransition(async () => {
      const result = await setCardField(projectId, { key: 'customer', value: id })
      if (result.error) setError(true)
      router.refresh()
    })
  }

  const q = query.trim().toLowerCase()
  const found = options.filter((o) => !q || o.label.toLowerCase().includes(q))
  // Before anything is typed the card's own customer stands first, ticked.
  const ordered = q ? found : [...found.filter((o) => o.value === value), ...found.filter((o) => o.value !== value)]
  const shown = ordered.slice(0, CUSTOMERS_SHOWN)
  // A name that is in the list already is not offered as a new customer.
  const newName = q && !options.some((o) => o.label.trim().toLowerCase() === q) ? query.trim() : ''

  return (
    <>
      <button
        ref={anchor}
        type="button"
        title={text ?? undefined}
        aria-expanded={open}
        disabled={pending}
        onClick={() => {
          setQuery('')
          setError(false)
          setOpen((o) => !o)
        }}
        className={`${className} hover:brightness-95 dark:hover:brightness-110`}
      >
        <span className="truncate">{text ?? empty}</span>
      </button>
      {error && (
        <p role="alert" className="mt-1 text-[11px] text-danger">
          {tc('saveFailed')}
        </p>
      )}
      <Popover open={open} onClose={close} anchor={anchor} label={t('cardField_customer')}>
        <PopoverHead title={t('cardField_customer')} close={close} closeLabel={tc('close')} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter takes the first customer the search leaves.
            if (e.key === 'Enter') {
              e.preventDefault()
              if (shown[0]) pick(shown[0].value)
            }
          }}
          placeholder={t('customerSearch')}
          aria-label={t('customerSearch')}
          className={SEARCH}
        />
        {shown.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted">{tCustomers('noResults')}</p>
        ) : (
          <ul className="-mx-1 mt-2 max-h-[min(16rem,38vh)] space-y-0.5 overflow-y-auto px-1">
            {shown.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  aria-current={o.value === value ? 'true' : undefined}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-hover ${o.value === value ? 'font-medium' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === value && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {ordered.length > shown.length && (
          <p className="px-1 pt-1 text-[11px] text-muted">{t('customerMore', { count: ordered.length - shown.length })}</p>
        )}
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setMaking(newName)
            }}
            className={`${btn.outlineSm} mt-2 w-full`}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{newName ? t('createCustomerOption', { name: newName }) : tCustomers('newCustomer')}</span>
          </button>
        )}
      </Popover>
      {making !== null && (
        <NewCustomerModal
          prefillName={making}
          onClose={() => setMaking(null)}
          onCreated={(customer) => {
            setMaking(null)
            pick(customer.id)
          }}
        />
      )}
    </>
  )
}
