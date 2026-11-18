import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Settings } from 'lucide-react'
import { projectControl } from './toolbar-styles'

/**
 * Where the projects page has its board tabs, Baustellen names its one board:
 * the board's colour and name, as the open tab wears them — no other boards
 * beside it, no "Neues Board". An administrator's gear leads to the board's
 * settings (Einstellungen → Boards), where the tick "unter Baustellen zeigen"
 * is changed too.
 */
export async function SitesBoardName({ name, swatch, settingsHref }: { name: string; swatch: string | null; settingsHref: string | null }) {
  const t = await getTranslations('sites')
  return (
    <span className={`flex shrink-0 items-center rounded-md ${projectControl.boardTabOn}`}>
      <span title={name} className={`${projectControl.boardTab} cursor-default`}>
        <span
          aria-hidden
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${swatch ? '' : 'border border-border-strong'}`}
          style={swatch ? { background: swatch } : undefined}
        />
        <span className="truncate">{name}</span>
      </span>
      {settingsHref && (
        <Link
          href={settingsHref}
          title={t('boardSettings')}
          aria-label={`${t('boardSettings')}: ${name}`}
          className="-ml-1 mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Settings className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </span>
  )
}
