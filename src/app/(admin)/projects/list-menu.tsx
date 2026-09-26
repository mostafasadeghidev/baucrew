'use client'

/**
 * The three dots at the right end of the list's bar: the office's doors —
 * drafts, templates, checklists, forms — the same ones the board keeps behind
 * its own menu, so the two views end the same way.
 */

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { MoreHorizontal } from 'lucide-react'
import { Menu, MenuLabel, menuItemClass } from '@/components/ui/menu'

export function ListMenu({ links }: { links: Array<{ href: string; label: string; count?: number }> }) {
  const t = useTranslations('projects')
  return (
    <Menu
      side="bottom"
      align="end"
      label={t('moreMenu')}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted shadow-sm transition-colors hover:bg-surface-hover hover:text-foreground"
      trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}
    >
      <MenuLabel>{t('moreMenu')}</MenuLabel>
      {links.map((link) => (
        <Link key={link.href} href={link.href} role="menuitem" className={menuItemClass}>
          <span className="flex-1 truncate">{link.label}</span>
          {link.count != null && (
            <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground">{link.count}</span>
          )}
        </Link>
      ))}
    </Menu>
  )
}
