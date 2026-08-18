import { LanguageSwitcher } from './language-switcher'
import { ThemeToggle } from './theme-toggle'
import { MobileNav } from './sidebar'

export async function Topbar({
  username,
  role,
  isAdmin,
  brandName,
  hasLogo,
}: {
  username: string
  role: string
  isAdmin: boolean
  brandName: string
  hasLogo: boolean
}) {
  return (
    // Sticky so language/theme stay reachable; user + logout live in the sidebar.
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-3 md:px-4 print:hidden">
      <MobileNav isAdmin={isAdmin} brandName={brandName} hasLogo={hasLogo} username={username} role={role} />
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  )
}
