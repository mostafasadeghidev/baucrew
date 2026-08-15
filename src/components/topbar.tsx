import { getTranslations } from 'next-intl/server'
import { logout } from '@/app/actions'
import { LanguageSwitcher } from './language-switcher'
import { ThemeToggle } from './theme-toggle'
import { MobileNav } from './sidebar'

export async function Topbar({
  username,
  isAdmin,
  brandName,
  hasLogo,
}: {
  username: string
  isAdmin: boolean
  brandName: string
  hasLogo: boolean
}) {
  const t = await getTranslations('auth')

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-3 md:px-4 print:hidden">
      <MobileNav isAdmin={isAdmin} brandName={brandName} hasLogo={hasLogo} />
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <LanguageSwitcher />
        <ThemeToggle />
        <span className="hidden text-sm text-muted sm:inline">{username}</span>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover"
          >
            {t('logout')}
          </button>
        </form>
      </div>
    </header>
  )
}
