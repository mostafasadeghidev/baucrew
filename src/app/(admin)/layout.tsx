import { cookies } from 'next/headers'
import { Mentions } from '@/components/mentions'
import { getTranslations } from 'next-intl/server'
import { canViewFinancials, requireStaff } from '@/lib/authz'
import { pricesHidden } from '@/lib/price-visibility'
import { PricesHiddenProvider } from '@/components/price-visibility'
import { getBranding } from '@/lib/branding'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { NavHistory } from '@/components/nav-history'
import { Suspense } from 'react'
import { syncProjectsInProgress } from '@/lib/project-lifecycle'
import { SIDEBAR_COOKIE, isSidebarCollapsed } from '@/lib/sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff()
  const branding = await getBranding()
  const tRoles = await getTranslations('roles')
  // Read here, not in the browser: the sidebar arrives at the width it was
  // left at instead of snapping to it after the page has been painted.
  const sidebarCollapsed = isSidebarCollapsed((await cookies()).get(SIDEBAR_COOKIE)?.value)
  // Only somebody who sees money at all has prices to hide.
  const seesPrices = canViewFinancials(user)
  const hidePrices = seesPrices && (await pricesHidden())
  // Planned projects whose first assignment day has arrived become "In Ausführung" (throttled).
  await syncProjectsInProgress()

  return (
    <PricesHiddenProvider hidden={hidePrices}>
      <div className="flex min-h-screen">
        <Suspense fallback={null}>
          <NavHistory />
        </Suspense>
        <Sidebar
          isAdmin={user.role === 'ADMIN'}
          brandName={branding.companyName}
          hasLogo={branding.hasLogo}
          username={user.username}
          role={tRoles(user.role)}
          roleKey={user.role}
          defaultCollapsed={sidebarCollapsed}
          priceSwitch={seesPrices}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            username={user.username}
            role={tRoles(user.role)}
            roleKey={user.role}
            isAdmin={user.role === 'ADMIN'}
            brandName={branding.companyName}
            hasLogo={branding.hasLogo}
            priceSwitch={seesPrices}
          />
          {/* Less air above than around: the rail's panel starts eight pixels
              down, and the page's own bar has to start on the same line as it
              or the two tops look like a mistake. */}
          <main className="flex-1 p-4 pt-2 md:p-6 md:pt-2 print:p-0">{children}</main>
        </div>
        {/* Who has been named in a comment: the bell in the corner. */}
        <Mentions user={user} area="admin" />
      </div>
    </PricesHiddenProvider>
  )
}
