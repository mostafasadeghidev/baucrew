import { useTranslations } from 'next-intl'
import { stockShortage } from '@/lib/stock'

/**
 * "⚠ Bestand 2 — 3 benötigt" badge next to a project item. Renders nothing
 * when stock is unknown or sufficient. Works in server and client components.
 */
export function StockWarning({
  needed,
  stock,
  unit,
  size = 'sm',
}: {
  needed: number | null | undefined
  stock: number | null | undefined
  unit?: string | null
  size?: 'sm' | 'lg'
}) {
  const t = useTranslations('warehouse')
  const short = stockShortage(needed, stock)
  if (short == null) return null
  const u = unit ? ` ${unit}` : ''
  return (
    <span
      className={`inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 font-medium text-amber-700 dark:text-amber-400 ${
        size === 'lg' ? 'py-0.5 text-sm' : 'py-px text-[11px]'
      }`}
      title={t('stockShortTitle', { short: short + u })}
    >
      ⚠ {t('stockShort', { stock: (stock ?? 0) + u, needed: (needed ?? 0) + u })}
    </span>
  )
}
