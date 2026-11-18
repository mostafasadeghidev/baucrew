import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireStaff } from '@/lib/authz'
import { canEditFeedback } from '@/lib/feedback'
import { listFeedback } from '@/lib/feedback-db'
import { FeedbackDesk } from '@/components/feedback/desk'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('feedback')
  return { title: t('title') }
}

/**
 * The feedback tasks in the office's frame: everybody with the admin area
 * opens it; the office edits, a site manager reads and writes notes. The crew
 * has the same desk on /my/feedback. Settings links here.
 */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const user = await requireStaff()
  const [items, { item }] = await Promise.all([listFeedback(user), searchParams])
  const initial = Number(item)
  return (
    <FeedbackDesk
      items={items}
      canEdit={canEditFeedback(user)}
      area="admin"
      commentHref="/?comment"
      initialItem={Number.isInteger(initial) && initial > 0 ? initial : null}
    />
  )
}
