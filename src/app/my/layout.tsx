import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireUser } from '@/lib/authz'
import { getBranding } from '@/lib/branding'
import { BrandMark } from '@/components/brand-mark'
import { logout } from '@/app/actions'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/components/theme-toggle'

export default async function MyAreaLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const t = await getTranslations('auth')
  const tToday = await getTranslations('today')
  const branding = await getBranding()

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <BrandMark hasLogo={branding.hasLogo} name={branding.companyName} />
        <div className="flex items-center gap-3">
          <Link
            href="/today"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
          >
            {tToday('title')}
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
            >
              {t('logout')}
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}
