'use client'

/**
 * The board's own menu, the three dots at the right end of its bar the way
 * Trello has them: whether the cards show their details, the archive, and
 * the office's doors — drafts, templates, checklists, forms, the settings.
 */

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Archive, Check, MoreHorizontal, Settings2 } from 'lucide-react'
import { Menu, MenuLabel, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { useCardDetails } from './board-prefs'

export function BoardMenu({
  onGround,
  archivedHref,
  links,
  settingsHref,
}: {
  onGround: boolean
  archivedHref: string
  links: Array<{ href: string; label: string; count?: number }>
  settingsHref: string | null
}) {
  const t = useTranslations('projects')
  const [details, toggleDetails] = useCardDetails()
  return (
    <Menu
      side="bottom"
      align="end"
      label={t('boardMenu')}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
        onGround ? 'text-white hover:bg-white/25' : 'text-muted hover:bg-surface-hover hover:text-foreground'
      }`}
      trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}
    >
      <MenuLabel>{t('boardMenu')}</MenuLabel>
      <button type="button" role="menuitemcheckbox" aria-checked={details} className={menuItemClass} onClick={toggleDetails}>
        <Check aria-hidden className={`h-3.5 w-3.5 shrink-0 text-accent ${details ? '' : 'invisible'}`} />
        {t('boardDetails')}
      </button>
      <Link href={archivedHref} role="menuitem" className={menuItemClass}>
        <Archive aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
        {t('boardArchived')}
      </Link>
      {links.length > 0 && (
        <>
          <MenuSeparator />
          {links.map((link) => (
            <Link key={link.href} href={link.href} role="menuitem" className={menuItemClass}>
              <span className="w-3.5 shrink-0" aria-hidden />
              <span className="flex-1 truncate">{link.label}</span>
              {link.count != null && (
                <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground">{link.count}</span>
              )}
            </Link>
          ))}
        </>
      )}
      {settingsHref && (
        <>
          <MenuSeparator />
          <Link href={settingsHref} role="menuitem" className={menuItemClass}>
            <Settings2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
            {t('boardsManage')}
          </Link>
        </>
      )}
    </Menu>
  )
}
