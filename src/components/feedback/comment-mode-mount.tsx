import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { displayName } from '@/lib/comments-db'
import { CommentMode } from './comment-mode'

/**
 * Comment mode on every page of the app, for whoever is logged in — the office
 * in the admin area and the crew on /my alike. Nothing at all for a visitor.
 * Outside the live site (`next dev`: a developer's machine, the demo copy) the
 * bar says that comments made here never reach the live list.
 */
export async function CommentModeMount() {
  const user = await getCurrentUser()
  if (!user) return null
  const localCopy = process.env.NODE_ENV === 'production' ? null : { liveUrl: liveSiteUrl() }
  return (
    <Suspense fallback={null}>
      <CommentMode name={displayName(user)} tasksHref={user.role === 'EMPLOYEE' ? '/my/feedback' : '/feedback'} localCopy={localCopy} />
    </Suspense>
  )
}

/** The live site's address from BAUCREW_LIVE_URL, when it is a proper https address. */
function liveSiteUrl(): string | null {
  const raw = process.env.BAUCREW_LIVE_URL?.trim() ?? ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}
