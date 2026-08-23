import { getTranslations } from 'next-intl/server'
import { requireUser } from '@/lib/authz'
import { getBranding } from '@/lib/branding'
import { BrandMark } from '@/components/brand-mark'
import { MyUserMenu } from './user-menu'

/**
 * Frame of the worker area: a slim sticky bar with the company mark and one
 * menu button (language, theme, sign out). Everything else is the day itself —
 * the page is an app for the phone, not a printed sheet.
 */
export default async function MyAreaLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const [tAuth, tNav, branding] = await Promise.all([
    getTranslations('auth'),
    getTranslations('nav'),
    getBranding(),
  ])
  const name = user.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
    : user.username

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
        <BrandMark hasLogo={branding.hasLogo} name={branding.companyName} imgClassName="h-7" />
        <MyUserMenu
          name={name}
          languageLabel={tNav('language')}
          themeLabel={tNav('theme')}
          logoutLabel={tAuth('logout')}
        />
      </header>
      <main className="flex-1 p-4 pb-16">{children}</main>
    </div>
  )
}
