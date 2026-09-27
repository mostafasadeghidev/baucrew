'use client'

/**
 * The card's fields over its back, in a grid the way the client's Trello shows
 * them under the description: the name small above, the value in a box below,
 * three of them on a coloured ground as on the card's front. A click opens the
 * card of the project that holds the field — the fields are described and
 * saved in one place, the project form, however many places show them — and
 * the customer's number leads to the customer, where it belongs.
 */

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FIELD_CHIP } from '@/components/swatches'
import { CARD_FIELD_TONE, type CardFieldKey } from '@/lib/board-cards'
import { PROJECT_EDIT_CARD_EVENT, type ProjectSectionKey } from '../project-form'

export type CardFieldCell = {
  key: CardFieldKey
  /** The value, formatted; null when there is none yet. */
  text: string | null
  /** The project form's card that holds the field; null for what is not the project's to change. */
  section: ProjectSectionKey | null
  /** Where the field is changed instead, when not on the project. */
  href: string | null
}

/** On the back the customer's wish has a ground of its own too, as it has in the client's Trello. */
const TONE = { ...CARD_FIELD_TONE, wish: 'red' as const }
const DATES = new Set<CardFieldKey>(['inspection', 'created'])

export function CardFieldsGrid({ cells }: { cells: CardFieldCell[] }) {
  const t = useTranslations('projects')
  const router = useRouter()

  const open = (cell: CardFieldCell) => {
    if (cell.section) window.dispatchEvent(new CustomEvent(PROJECT_EDIT_CARD_EVENT, { detail: cell.section }))
    else if (cell.href) router.push(cell.href)
  }

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{t('cardFieldsTitle')}</h2>
        <p className="mt-0.5 text-xs text-muted">{t('cardFieldsHint')}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-5 sm:grid-cols-3">
        {cells.map((cell) => {
          const tone = TONE[cell.key]
          const clickable = cell.section !== null || cell.href !== null
          return (
            <div key={cell.key} className="min-w-0">
              <dt className="truncate text-[11px] font-semibold text-muted">{t(`cardField_${cell.key}`)}</dt>
              <dd className="mt-1">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => open(cell)}
                  title={cell.text ?? undefined}
                  className={`flex h-9 w-full items-center rounded-md px-2.5 text-left text-sm transition-[filter] ${tone ? FIELD_CHIP[tone] : 'bg-subtle text-foreground'} ${
                    clickable ? 'hover:brightness-95 dark:hover:brightness-110' : 'cursor-default'
                  } ${cell.text ? '' : 'opacity-70'}`}
                >
                  <span className="truncate">{cell.text ?? (DATES.has(cell.key) ? t('cardFieldPickDate') : t('cardFieldAdd'))}</span>
                </button>
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
