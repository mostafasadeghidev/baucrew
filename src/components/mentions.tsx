import { getLocale, getTranslations } from 'next-intl/server'
import { mentionsFor } from '@/lib/mentions-db'
import { MentionsBell } from './mentions-bell'

/** The bell with the comments naming the user, loaded for the frame it stands in. */
export async function Mentions({
  user,
  area,
}: {
  user: { id: string; role: string; mentionsSeenAt: Date | null }
  /** On the office side a line opens the project; the phone has no project page. */
  area: 'admin' | 'my'
}) {
  const [t, locale, { items, unread }] = await Promise.all([getTranslations('projects'), getLocale(), mentionsFor(user)])
  const stamp = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <MentionsBell
      unread={unread}
      items={items.map((item) => ({
        id: item.id,
        href: area === 'admin' ? `/projects/${item.projectId}` : null,
        project: `${item.number} · ${item.name}`,
        author: item.author ?? t('commentNoAuthor'),
        snippet: item.body.length > 140 ? `${item.body.slice(0, 140)}…` : item.body,
        when: stamp.format(item.createdAt),
        fresh: item.fresh,
      }))}
    />
  )
}
