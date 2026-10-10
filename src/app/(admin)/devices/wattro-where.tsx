import { HardHat, User, Warehouse } from 'lucide-react'
import type { WattroWhereKind } from '@/lib/wattro/details'

/**
 * Where a machine is, the way Wattro says it: one quiet icon for the kind of
 * place (store, person, site) and its name. Shared by the device list and the
 * device page so both read the same.
 */

const ICONS: Record<WattroWhereKind, typeof User> = {
  store: Warehouse,
  employee: User,
  project: HardHat,
}

/** Store green, person blue, site amber — the colour of the icon only, never of the text. */
const TONES: Record<WattroWhereKind, string> = {
  store: 'text-emerald-600 dark:text-emerald-400',
  employee: 'text-sky-600 dark:text-sky-400',
  project: 'text-amber-600 dark:text-amber-400',
}

/**
 * The same three colours as plain CSS, for what a class cannot reach: the
 * dots in the page's tabs and the pins on the map (emerald, sky, amber 600).
 */
export const PLACE_COLOURS: Record<WattroWhereKind, string> = {
  store: '#059669',
  employee: '#0284c7',
  project: '#d97706',
}

export function WhereIcon({ kind, label }: { kind: WattroWhereKind; label: string }) {
  const Icon = ICONS[kind]
  return <Icon className={`h-4 w-4 shrink-0 ${TONES[kind]}`} aria-label={label} />
}

export { whereName } from '@/lib/wattro/details'
