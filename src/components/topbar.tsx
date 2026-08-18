import { MobileNav } from './sidebar'

/**
 * Mobile-only bar: just the menu button. Language, theme, user and sign-out
 * live in the sidebar's user menu.
 */
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
    <header className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-surface px-3 md:hidden print:hidden">
      <MobileNav isAdmin={isAdmin} brandName={brandName} hasLogo={hasLogo} username={username} role={role} />
    </header>
  )
}
