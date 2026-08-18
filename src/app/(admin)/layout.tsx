import { requireManagement } from '@/lib/authz'
import { getBranding } from '@/lib/branding'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { NavHistory } from '@/components/nav-history'
import { Suspense } from 'react'
import { syncProjectsInProgress } from '@/lib/project-lifecycle'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireManagement()
  const branding = await getBranding()
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
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          username={user.username}
          isAdmin={user.role === 'ADMIN'}
          brandName={branding.companyName}
          hasLogo={branding.hasLogo}
        />
        <main className="flex-1 p-4 md:p-6 print:p-0">{children}</main>
      </div>
    </div>
  )
}
