import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/authz'

/**
 * A card address opened cold — a bookmark, a refresh, a shared link — is not
 * a sheet over a board (there is no board to lay it over): it shows the
 * project's full page, as a Trello link does after a reload.
 */
export default async function CardRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStaff()
  redirect(`/projects/${id}`)
}
