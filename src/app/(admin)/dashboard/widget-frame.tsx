import { ArrowDown, ArrowUp, Columns2, Eye, EyeOff, GripVertical, Square } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { btn } from '@/components/ui/button'
import type { WidgetLayout } from '@/lib/dashboard-layout'
import { changeDashboardLayout } from './actions'

/**
 * Edit-mode chrome around one dashboard card: name, move up/down, half/full
 * width, hide. Plain forms posting to a server action — no client JS.
 */
export async function WidgetFrame({
  layout,
  title,
  first,
  last,
  children,
}: {
  layout: WidgetLayout
  title: string
  first: boolean
  last: boolean
  children: React.ReactNode
}) {
  const t = await getTranslations('dashboard')
  const iconBtn = `${btn.outlineSm} h-7 w-7 justify-center p-0`

  const control = (op: string, label: string, icon: React.ReactNode, disabled = false) => (
    <form action={changeDashboardLayout}>
      <input type="hidden" name="widget" value={layout.id} />
      <input type="hidden" name="op" value={op} />
      <button type="submit" className={iconBtn} title={label} aria-label={label} disabled={disabled}>
        {icon}
      </button>
    </form>
  )

  return (
    <div className="rounded-xl border border-dashed border-accent/50 bg-accent/5 p-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-1 text-xs font-semibold text-muted">
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
          {title}
        </span>
        <div className="flex items-center gap-1">
          {control('up', t('moveUp'), <ArrowUp className="h-3.5 w-3.5" aria-hidden />, first)}
          {control('down', t('moveDown'), <ArrowDown className="h-3.5 w-3.5" aria-hidden />, last)}
          {control(
            'width',
            layout.width === 'full' ? t('makeHalf') : t('makeFull'),
            layout.width === 'full' ? (
              <Columns2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Square className="h-3.5 w-3.5" aria-hidden />
            )
          )}
          {control(
            'toggle',
            layout.hidden ? t('showWidget') : t('hideWidget'),
            layout.hidden ? (
              <Eye className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
            )
          )}
        </div>
      </div>
      {layout.hidden ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          {t('widgetHidden')}
        </p>
      ) : (
        children
      )}
    </div>
  )
}
