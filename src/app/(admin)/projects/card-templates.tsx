'use client'

/**
 * Trello's card templates, at the right end of a list's foot beside "Karte
 * hinzufügen": a button that opens "Kartenvorlagen" — the templates drawn as
 * cards with the light-blue "Vorlage" badge, "Eine neue Vorlage erstellen" and
 * "Vorlagen bearbeiten".
 *
 * A template picked here becomes Trello's "Karte aus Vorlage erstellen": the
 * title (the template's, to be typed over), the customer every project needs,
 * and under "Behalten …" what of the template goes with the card — only what
 * the template has. The card is made in this list and opens at once. A new
 * template is a name typed here, and it opens on its own sheet over the board
 * to be filled in; "Vorlagen bearbeiten" opens a template there the same way.
 * Both are the office's; a site manager makes cards from the templates.
 */

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlignLeft, ChevronLeft, ListChecks, Pencil, Plus, X } from 'lucide-react'
import { Popover } from '@/components/ui/popover'
import { Combobox } from '@/components/combobox'
import { btn } from '@/components/ui/button'
import { LABEL_PILL, PERSON_SWATCH } from '@/components/swatches'
import { templateParts, type TemplateCounts } from '@/lib/card-templates'
import { CARD } from './board-card'
import { FromTemplateIcon, TemplateBadge } from './template-badge'
import { createCardFromTemplate } from './actions'
import { createTemplateNamed } from './templates/actions'

export type BoardTemplate = {
  id: string
  name: string
  /** The ≡ of a Trello card: the template brings a description. */
  hasDescription: boolean
  /** The trade, worn as the card's label. */
  label: { text: string; swatch: number } | null
  /** The points of the template's checklists — Trello's "0/5". */
  checkItems: number
  /** Site manager first, then the crew — the first few, with how many more. */
  people: Array<{ initials: string; name: string; swatch: number; manager: boolean }>
  more: number
  /** How much of each part it holds — what "Behalten …" offers. */
  counts: TemplateCounts
}

type View = { kind: 'list' } | { kind: 'edit' } | { kind: 'create'; template: BoardTemplate }

const ICON_BUTTON = 'flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground'

export function CardTemplates({
  templates,
  customers,
  place,
  manage,
  cardHref,
  templateHref,
}: {
  templates: BoardTemplate[]
  customers: Array<{ value: string; label: string }>
  /** The list the button stands at the foot of: its status, and its rule if it has one. */
  place: { status: string; rule: string | null }
  /** Whether the reader may make and change templates — the office. */
  manage: boolean
  /** The address of a card opened over the board, and of a template. */
  cardHref: (id: string) => string
  templateHref: (id: string) => string
}) {
  const t = useTranslations('projects')
  const tt = useTranslations('templates')
  const tc = useTranslations('common')
  const router = useRouter()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [naming, setNaming] = useState(false)
  const [newCustomer, setNewCustomer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const close = useCallback(() => {
    setOpen(false)
    setView({ kind: 'list' })
    setNaming(false)
    setNewCustomer(null)
    setError(null)
  }, [])

  const go = (view: View) => {
    setError(null)
    setNewCustomer(null)
    setView(view)
  }

  function submitCard(e: React.FormEvent<HTMLFormElement>, template: BoardTemplate) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    if (newCustomer) data.set('customerName', newCustomer)
    setError(null)
    startTransition(async () => {
      const result = await createCardFromTemplate(template.id, place, data)
      if (result.error || !result.id) {
        setError(
          result.error === 'nameRequired'
            ? t('kanbanAddErrorName')
            : result.error === 'customerRequired'
              ? t('kanbanAddErrorCustomer')
              : tc('saveFailed')
        )
        return
      }
      close()
      router.push(cardHref(result.id), { scroll: false })
    })
  }

  function submitTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('name') ?? '')
    setError(null)
    startTransition(async () => {
      const result = await createTemplateNamed(name)
      if (result.error || !result.id) {
        setError(result.error === 'nameRequired' ? tt('nameRequired') : tc('saveFailed'))
        return
      }
      close()
      router.push(templateHref(result.id), { scroll: false })
    })
  }

  const edit = (id: string) => {
    close()
    router.push(templateHref(id), { scroll: false })
  }

  const head = (title: string, back: (() => void) | null) => (
    <div className="mb-3 grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center">
      {back ? (
        <button type="button" onClick={back} aria-label={t('templateBack')} title={t('templateBack')} className={ICON_BUTTON}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <span />
      )}
      <p className="truncate text-center text-sm font-semibold">{title}</p>
      <button type="button" onClick={close} aria-label={tc('close')} title={tc('close')} className={ICON_BUTTON}>
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )

  const list = (editing: boolean) =>
    templates.length === 0 ? (
      <p className="px-1 pb-1 text-sm text-muted">{t('templatesNone')}</p>
    ) : (
      // The cards' shadows and rings need the room the padding gives them.
      <ul className="-m-1 max-h-[min(24rem,50vh)] space-y-2 overflow-y-auto p-1">
        {templates.map((template) => (
          <li key={template.id}>
            <TemplateCard
              template={template}
              badge={t('templateBadge')}
              editing={editing}
              onClick={() => (editing ? edit(template.id) : go({ kind: 'create', template }))}
            />
          </li>
        ))}
      </ul>
    )

  const failed = error && (
    <p role="alert" className="mt-2 text-xs text-danger">
      {error}
    </p>
  )

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        title={t('templatesButton')}
        aria-label={t('templatesButton')}
        aria-expanded={open}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
      >
        <FromTemplateIcon className="h-4 w-4" />
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={t('templatesTitle')}>
        {view.kind === 'create' ? (
          <>
            {head(t('templateCreateTitle'), () => go({ kind: 'list' }))}
            <form key={view.template.id} onSubmit={(e) => submitCard(e, view.template)} className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-muted">{t('templateCardTitle')}</span>
                <textarea
                  name="name"
                  required
                  autoFocus
                  rows={2}
                  maxLength={300}
                  defaultValue={view.template.name}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    // Enter makes the card, as in Trello; a line break has no place in a title.
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.currentTarget.form?.requestSubmit()
                    }
                  }}
                  className="mt-1 block w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </label>
              <div>
                <span className="text-xs font-semibold text-muted">{t('templateCustomer')}</span>
                {newCustomer ? (
                  <p className="mt-1 flex items-center justify-between gap-2 rounded-md bg-accent/10 px-2 py-1.5 text-xs text-accent">
                    <span className="truncate">{t('kanbanAddNewCustomer', { name: newCustomer })}</span>
                    <button type="button" onClick={() => setNewCustomer(null)} aria-label={tc('cancel')} className="shrink-0 rounded p-0.5 hover:bg-accent/10">
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </p>
                ) : (
                  <Combobox
                    name="customerId"
                    options={customers}
                    placeholder={t('kanbanAddCustomer')}
                    noResultsLabel={t('noResults')}
                    onCreateNew={(name) => setNewCustomer(name)}
                    createLabel={(name) => t('kanbanAddNewCustomer', { name })}
                  />
                )}
              </div>
              {templateParts(view.template.counts).length > 0 && (
                <fieldset>
                  <legend className="text-xs font-semibold text-muted">{t('templateKeep')}</legend>
                  <div className="mt-1 space-y-1">
                    {templateParts(view.template.counts).map(({ part, count }) => (
                      <label key={part} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" name="keep" value={part} defaultChecked className="h-4 w-4 accent-[var(--accent)]" />
                        {t(`templateKeep_${part}`, { count })}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <button type="submit" disabled={pending} className={btn.primarySm}>
                {t('templateCreateSubmit')}
              </button>
            </form>
            {failed}
          </>
        ) : view.kind === 'edit' ? (
          <>
            {head(t('templatesEdit'), () => go({ kind: 'list' }))}
            <p className="mb-2 text-xs text-muted">{t('templatesEditHint')}</p>
            {list(true)}
          </>
        ) : (
          <>
            {head(t('templatesTitle'), null)}
            {list(false)}
            {manage &&
              (naming ? (
                <form onSubmit={submitTemplate} className="mt-2 space-y-1.5">
                  <input
                    name="name"
                    autoFocus
                    required
                    maxLength={200}
                    placeholder={t('templateNewName')}
                    aria-label={t('templateNewName')}
                    className={`block w-full px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent ${CARD}`}
                  />
                  <div className="flex items-center gap-1.5">
                    <button type="submit" disabled={pending} className={btn.primarySm}>
                      {t('templateNewSubmit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNaming(false)
                        setError(null)
                      }}
                      aria-label={tc('cancel')}
                      title={tc('cancel')}
                      className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setNaming(true)}
                  className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                  {t('templateNew')}
                </button>
              ))}
            {manage && templates.length > 0 && (
              <button
                type="button"
                onClick={() => go({ kind: 'edit' })}
                className="mt-1 w-full rounded-md bg-subtle px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-hover"
              >
                {t('templatesEdit')}
              </button>
            )}
            {failed}
          </>
        )}
      </Popover>
    </>
  )
}

/** A template drawn as the card it makes: its label, its name, the badge, its marks, its people. */
function TemplateCard({
  template,
  badge,
  editing,
  onClick,
}: {
  template: BoardTemplate
  badge: string
  editing: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative block w-full px-3 py-2 text-left ring-accent/70 transition-shadow hover:ring-2 ${CARD}`}
    >
      {template.label && (
        <span className={`mb-1.5 inline-block h-5 rounded px-2 text-[11px] font-medium leading-5 ${LABEL_PILL[template.label.swatch]}`}>
          {template.label.text}
        </span>
      )}
      <span className="block break-words pr-5 text-sm leading-snug text-foreground">{template.name}</span>
      <span className="mt-1.5 flex items-end justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <TemplateBadge label={badge} />
          {template.hasDescription && <AlignLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          {template.checkItems > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <ListChecks className="h-3 w-3 shrink-0" aria-hidden />
              0/{template.checkItems}
            </span>
          )}
        </span>
        {template.people.length > 0 && (
          <span className="flex shrink-0 -space-x-1">
            {template.people.map((person) => (
              <span
                key={person.name}
                title={person.name}
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ${
                  person.manager ? 'ring-accent' : 'ring-white dark:ring-[#22272b]'
                } ${PERSON_SWATCH[person.swatch]}`}
              >
                {person.initials}
              </span>
            ))}
            {template.more > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-subtle px-1 text-[9px] font-medium text-muted ring-2 ring-white dark:ring-[#22272b]">
                +{template.more}
              </span>
            )}
          </span>
        )}
      </span>
      {editing && (
        <Pencil className="absolute right-2 top-2 h-3.5 w-3.5 text-muted opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
      )}
    </button>
  )
}
