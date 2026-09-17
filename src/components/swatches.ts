/**
 * The colours a label and a person wear on the board, in a card's sheet and
 * under a comment — literal, so Tailwind finds them; which one a key gets is
 * `swatchOf` in lib/board-cards, so the same trade and the same person are
 * the same colour everywhere.
 *
 * A label is a pill with its name, and a bar while the board's labels are
 * folded, the way Trello draws them. Both lists follow `LABEL_COLORS` in
 * lib/board-cards; which of the ten a trade wears is chosen under
 * Einstellungen.
 */
export const LABEL_BAR = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-indigo-500',
  'bg-lime-500',
  'bg-pink-500',
]

export const LABEL_PILL = [
  'bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100',
  'bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100',
  'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100',
  'bg-rose-200 text-rose-900 dark:bg-rose-800 dark:text-rose-100',
  'bg-violet-200 text-violet-900 dark:bg-violet-800 dark:text-violet-100',
  'bg-teal-200 text-teal-900 dark:bg-teal-800 dark:text-teal-100',
  'bg-orange-200 text-orange-900 dark:bg-orange-800 dark:text-orange-100',
  'bg-indigo-200 text-indigo-900 dark:bg-indigo-800 dark:text-indigo-100',
  'bg-lime-200 text-lime-900 dark:bg-lime-800 dark:text-lime-100',
  'bg-pink-200 text-pink-900 dark:bg-pink-800 dark:text-pink-100',
]

/** The two labels that are not trades. */
export const URGENT_LABEL = { bar: 'bg-red-500', pill: 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100' }
export const SUB_LABEL = { bar: 'bg-neutral-400', pill: 'bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100' }

export const PERSON_SWATCH = [
  'bg-sky-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-violet-600',
  'bg-teal-600',
  'bg-orange-600',
  'bg-indigo-600',
]
