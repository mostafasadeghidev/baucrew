import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/authz'

/** A Baustellen card address opened cold shows the project's full page, as the projects page's does. */
export default async function SitesCardRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStaff()
  redirect(`/projects/${id}`)
}
