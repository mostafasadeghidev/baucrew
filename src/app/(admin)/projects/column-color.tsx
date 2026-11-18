'use client'

/**
 * A list's own colour, the way Trello lets a list wear one: a pale tint of one
 * of the ten label colours behind its cards, or none for the plain grey well.
 * Picked from the list's menu on the board and in the board window; both draw
 * the same swatches, each the very tint the list will wear.
 */
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LIST_TINT } from '@/components/swatches'
import { LABEL_COLORS, labelColorKey, type LabelColor } from '@/lib/board-cards'
import { Menu, MenuLabel } from '@/components/ui/menu'

/** The ground a list stands on: its tint, else the plain well. */
export function listGround(color: string | null | undefined): string {
  const key = labelColorKey(color)
  return key ? LIST_TINT[LABEL_COLORS.indexOf(key)] : 'bg-subtle'
}

const SWATCH =
  'relative flex h-7 items-center justify-center rounded-md ring-1 ring-inset ring-black/10 transition-shadow hover:ring-2 hover:ring-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:ring-white/15'

/**
 * The eleven choices — none, then the ten colours. In a menu each is a menu
 * item (the menu closes on the pick); elsewhere a radio in a group.
 */
export function ColumnColorSwatches({ value, onPick, inMenu = false }: { value: LabelColor | null; onPick: (color: LabelColor | null) => void; inMenu?: boolean }) {
  const t = useTranslations('projects')
  const choices: Array<LabelColor | null> = [null, ...LABEL_COLORS]
  return (
    <div role={inMenu ? 'group' : 'radiogroup'} aria-label={t('columnColor')} className="grid grid-cols-6 gap-1.5 px-2 pb-2 pt-0.5">
      {choices.map((color) => {
        const on = value === color
        const name = color ? t(`columnColor_${color}`) : t('columnColorNone')
        return (
          <button
            key={color ?? 'none'}
            type="button"
            role={inMenu ? 'menuitemradio' : 'radio'}
            aria-checked={on}
            aria-label={name}
            title={name}
            onClick={() => onPick(color)}
            className={`${SWATCH} ${color ? listGround(color) : 'bg-surface'} ${on ? 'outline-2 outline-offset-1 outline-accent' : ''}`}
          >
            {/* None is a white tile struck through, so it reads as "no colour" without a word. */}
            {!color && <span aria-hidden className="h-px w-5 rotate-[-35deg] bg-muted" />}
            {on && color && <Check aria-hidden className="h-3.5 w-3.5 text-foreground/70" />}
          </button>
        )
      })}
    </div>
  )
}

/** The colour as a small tile that opens the swatches — for a row in the board window. */
export function ColumnColorMenu({ value, onPick, name }: { value: LabelColor | null; onPick: (color: LabelColor | null) => void; name: string }) {
  const t = useTranslations('projects')
  const current = value ? t(`columnColor_${value}`) : t('columnColorNone')
  return (
    <Menu
      side="bottom"
      align="end"
      label={t('columnColorFor', { name, color: current })}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      trigger={
        <span aria-hidden className={`relative flex h-4 w-4 items-center justify-center overflow-hidden rounded ring-1 ring-inset ring-black/15 dark:ring-white/20 ${value ? listGround(value) : 'bg-surface'}`}>
          {!value && <span className="h-px w-5 rotate-[-35deg] bg-muted" />}
        </span>
      }
    >
      <MenuLabel>{t('columnColor')}</MenuLabel>
      <ColumnColorSwatches value={value} onPick={onPick} inMenu />
    </Menu>
  )
}
