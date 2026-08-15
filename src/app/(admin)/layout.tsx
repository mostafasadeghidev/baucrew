import { requireManagement } from '@/lib/authz'
import { getBranding } from '@/lib/branding'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireManagement()
  const branding = await getBranding()

  return (
    <div className="flex min-h-screen">
      <Sidebar
        isAdmin={user.role === 'ADMIN'}
        brandName={branding.companyName}
        hasLogo={branding.hasLogo}
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
