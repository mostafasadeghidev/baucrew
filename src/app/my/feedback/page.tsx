import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireUser } from '@/lib/authz'
import { canEditFeedback } from '@/lib/feedback'
import { listFeedback } from '@/lib/feedback-db'
import { FeedbackDesk } from '@/components/feedback/desk'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('feedback')
  return { title: t('title') }
}

/** The feedback tasks in the crew's frame: what the crew and the site managers wrote, and their own. */
export default async function MyFeedbackPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const user = await requireUser()
  const [items, { item }] = await Promise.all([listFeedback(user), searchParams])
  const initial = Number(item)
  return (
    <FeedbackDesk
      items={items}
      canEdit={canEditFeedback(user)}
      area="my"
      commentHref="/my?comment"
      initialItem={Number.isInteger(initial) && initial > 0 ? initial : null}
    />
  )
}
