'use client'

import Link from 'next/link'
import { ChevronDown, ListTodo, LogOut } from 'lucide-react'
import { logout } from '@/app/actions'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { Menu, MenuLabel, MenuRow, MenuSeparator, menuItemClass } from '@/components/ui/menu'

/**
 * One button instead of four in the worker header: name + chevron, opening a
 * menu with language, theme and sign out. Keeps the bar readable on a phone.
 */
export function MyUserMenu({
  name,
  languageLabel,
  themeLabel,
  logoutLabel,
  feedbackLabel,
}: {
  name: string
  languageLabel: string
  themeLabel: string
  logoutLabel: string
  /** The feedback tasks: what the crew commented, and how it stands. */
  feedbackLabel: string
}) {
  return (
    <Menu
      side="bottom"
      align="end"
      label={name}
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-hover"
      trigger={
        <>
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-[11px] font-semibold uppercase text-accent"
          >
            {name.slice(0, 2)}
          </span>
          <span className="max-w-32 truncate">{name}</span>
          <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
        </>
      }
    >
      <MenuLabel>{name}</MenuLabel>
      <MenuSeparator />
      <MenuRow label={languageLabel}>
        <LanguageSwitcher compact />
      </MenuRow>
      <MenuRow label={themeLabel}>
        <ThemeToggle withLabel />
      </MenuRow>
      <MenuSeparator />
      <Link href="/my/feedback" role="menuitem" className={menuItemClass}>
        <ListTodo className="h-4 w-4" aria-hidden />
        {feedbackLabel}
      </Link>
      <MenuSeparator />
      <form action={logout}>
        <button type="submit" role="menuitem" className={`${menuItemClass} text-danger hover:bg-danger/10`}>
          <LogOut className="h-4 w-4" aria-hidden />
          {logoutLabel}
        </button>
      </form>
    </Menu>
  )
}
