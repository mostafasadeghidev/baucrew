import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { requireManagement } from '@/lib/authz'
import { getBranding } from '@/lib/branding'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { NavHistory } from '@/components/nav-history'
import { Suspense } from 'react'
import { syncProjectsInProgress } from '@/lib/project-lifecycle'
import { SIDEBAR_COOKIE, isSidebarCollapsed } from '@/lib/sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireManagement()
  const branding = await getBranding()
  const tRoles = await getTranslations('roles')
  // Read here, not in the browser: the sidebar arrives at the width it was
  // left at instead of snapping to it after the page has been painted.
  const sidebarCollapsed = isSidebarCollapsed((await cookies()).get(SIDEBAR_COOKIE)?.value)
  // Planned projects whose first assignment day has arrived become "In Ausführung" (throttled).
  await syncProjectsInProgress()

  return (
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
        defaultCollapsed={sidebarCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          username={user.username}
          role={tRoles(user.role)}
          isAdmin={user.role === 'ADMIN'}
          brandName={branding.companyName}
          hasLogo={branding.hasLogo}
        />
        {/* Less air above than around: the rail's panel starts eight pixels
            down, and the page's own bar has to start on the same line as it
            or the two tops look like a mistake. */}
        <main className="flex-1 p-4 pt-2 md:p-6 md:pt-2 print:p-0">{children}</main>
      </div>
    </div>
  )
}
