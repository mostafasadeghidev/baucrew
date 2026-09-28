import { getLocale, getTranslations } from 'next-intl/server'
import { mentionsFor } from '@/lib/mentions-db'
import { notificationsFor } from '@/lib/notifications-db'
import { notificationLine } from '@/lib/notifications'
import { todayUtc } from '@/lib/dates'
import { ProjectStatus } from '@/generated/prisma/enums'
import { MentionsBell, type MentionRow } from './mentions-bell'

/**
 * The bell with the comments naming the user, loaded for the frame it stands
 * in. On the office side it is Trello's notifications as well: what happened
 * on the cards the user is on or follows, and the days coming due there.
 */
export async function Mentions({
  user,
  area,
}: {
  user: { id: string; role: string; mentionsSeenAt: Date | null; employee?: { id: string } | null }
  /** On the office side a line opens the project; the phone has no project page. */
  area: 'admin' | 'my'
}) {
  const [t, tStatus, locale, mentions, news] = await Promise.all([
    getTranslations('projects'),
    getTranslations('status'),
    getLocale(),
    mentionsFor(user),
    area === 'admin' ? notificationsFor({ id: user.id, role: user.role, employee: user.employee ?? null }) : Promise.resolve({ items: [], unread: 0 }),
  ])
  const stamp = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const today = todayUtc()
  const day = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
  const rows: Array<MentionRow & { at: number }> = [
    ...mentions.items.map((item) => ({
      id: `m-${item.id}`,
      // The card opens over the projects, the way Trello opens it from a notification.
      href: area === 'admin' ? `/projects?card=${item.projectId}` : null,
      project: `${item.number} · ${item.name}`,
      author: item.author ?? t('commentNoAuthor'),
      snippet: item.body.length > 140 ? `${item.body.slice(0, 140)}…` : item.body,
      when: stamp.format(item.createdAt),
      fresh: item.fresh,
      at: item.createdAt.getTime(),
    })),
    ...news.items.map((item) => ({
      id: `n-${item.id}`,
      href: item.project ? `/projects?card=${item.project.id}` : null,
      project: item.project ? `${item.project.number} · ${item.project.name}` : '',
      author: item.actor ?? t('notificationReminder'),
      snippet: notificationLine(
        item.kind,
        item.text,
        (key, values) => t(key as 'nComment', values),
        (status) => (status in ProjectStatus ? tStatus(status as ProjectStatus) : status),
        today,
        (iso) => day.format(new Date(`${iso}T00:00:00.000Z`))
      ),
      when: stamp.format(item.createdAt),
      fresh: item.fresh,
      at: item.createdAt.getTime(),
    })),
  ].sort((a, b) => b.at - a.at)

  return (
    <MentionsBell
      title={area === 'admin' ? t('notificationsTitle') : t('mentionsTitle')}
      empty={area === 'admin' ? t('notificationsNone') : t('mentionsNone')}
      unread={mentions.unread + news.unread}
      items={rows.slice(0, 40).map((row) => ({
        id: row.id,
        href: row.href,
        project: row.project,
        author: row.author,
        snippet: row.snippet,
        when: row.when,
        fresh: row.fresh,
      }))}
    />
  )
}
