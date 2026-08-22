import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCurrentUser } from '@/lib/auth'
import { getBranding } from '@/lib/branding'
import { BrandMark } from '@/components/brand-mark'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  // Only in-app paths (a QR code on the warehouse screen links here).
  const target = next && /^\/[A-Za-z0-9/_\-?&=.%#]*$/.test(next) && !next.startsWith('//') ? next : undefined
  const user = await getCurrentUser()
  if (user) redirect(target ?? (user.role === 'EMPLOYEE' ? '/my' : '/dashboard'))

  const t = await getTranslations('auth')
  const branding = await getBranding()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-center justify-end gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
        <div className="rounded-lg border border-border bg-surface p-8 shadow-sm">
          <BrandMark
            hasLogo={branding.hasLogo}
            name={branding.companyName}
            imgClassName="h-12"
            textClassName="text-2xl font-bold tracking-tight"
          />
          <p className="mt-4 text-sm text-muted">{t('loginSubtitle')}</p>
          <LoginForm next={target} />
        </div>
      </div>
    </main>
  )
}
