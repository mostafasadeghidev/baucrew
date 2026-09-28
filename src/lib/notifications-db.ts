import 'server-only'
import { db } from './db'
import { todayUtc } from './dates'
import { dueSoon, recipientsFor, type NotifyKind } from './notifications'

/**
 * Tells the card's members and those following it what just happened on it
 * (src/lib/notifications.ts decides who). Never in the way of what was done:
 * a failure here is written to the log and left at that.
 */
export async function notifyCard(
  projectId: string,
  actorId: string | null,
  kind: NotifyKind,
  opts: {
    text?: string | null
    officeOnly?: boolean
    except?: string[]
    /** Only the account behind this person — "added you to the card". */
    onlyEmployeeId?: string
  } = {}
): Promise<void> {
  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { managerId: true, team: { select: { employeeId: true } }, watches: { select: { userId: true } } },
    })
    if (!project) return
    const members = new Set([project.managerId, ...project.team.map((m) => m.employeeId)].filter((e): e is string => e !== null))
    const watchers = new Set(project.watches.map((w) => w.userId))
    const users = await db.user.findMany({
      where: opts.onlyEmployeeId
        ? { active: true, employee: { id: opts.onlyEmployeeId } }
        : { active: true, OR: [{ id: { in: [...watchers] } }, { employee: { id: { in: [...members] } } }] },
      select: { id: true, role: true, employee: { select: { id: true } } },
    })
    const ids = recipientsFor({
      actorId,
      officeOnly: opts.officeOnly,
      except: opts.except,
      candidates: users.map((u) => ({
        userId: u.id,
        role: u.role,
        member: opts.onlyEmployeeId ? true : u.employee ? members.has(u.employee.id) : false,
        watching: watchers.has(u.id),
      })),
    })
    if (ids.length === 0) return
    const text = opts.text ? opts.text.slice(0, 300) : null
    await db.notification.createMany({ data: ids.map((userId) => ({ userId, projectId, actorId, kind, text })) })
  } catch (e) {
    console.error('notify failed', e)
  }
}

/**
 * The days coming due on the cards the user is on or follows — overdue, today
 * or tomorrow, and not ticked done — told once per card and day: the first
 * time the bell is drawn after the day came near.
 */
async function tellDueDays(user: { id: string; role: string; employeeId: string | null }) {
  const today = todayUtc()
  const near = new Date(today.getTime() + 86_400_000)
  const cards = await db.project.findMany({
    where: {
      archivedAt: null,
      doneAt: null,
      dueDate: { not: null, lte: near },
      status: { notIn: ['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'] },
      OR: [
        { watches: { some: { userId: user.id } } },
        ...(user.employeeId ? [{ managerId: user.employeeId }, { team: { some: { employeeId: user.employeeId } } }] : []),
      ],
    },
    select: { id: true, dueDate: true, managerId: true, team: { select: { employeeId: true } } },
    take: 50,
  })
  for (const card of cards) {
    if (!card.dueDate || !dueSoon(card.dueDate, today)) continue
    // A site manager hears of a card only while named on it.
    const member = user.employeeId !== null && (card.managerId === user.employeeId || card.team.some((m) => m.employeeId === user.employeeId))
    if (user.role === 'SITE_MANAGER' && !member) continue
    const day = card.dueDate.toISOString().slice(0, 10)
    const told = await db.notification.count({ where: { userId: user.id, projectId: card.id, kind: 'due', text: day } })
    if (told === 0) await db.notification.create({ data: { userId: user.id, projectId: card.id, kind: 'due', text: day } })
  }
}

export type NotificationItem = {
  id: string
  kind: string
  text: string | null
  createdAt: Date
  fresh: boolean
  project: { id: string; number: string; name: string } | null
  actor: string | null
}

/** The bell's lines for the office and the site managers, newest first, with how many are new. */
export async function notificationsFor(user: {
  id: string
  role: string
  employee: { id: string } | null
}): Promise<{ items: NotificationItem[]; unread: number }> {
  if (user.role === 'EMPLOYEE') return { items: [], unread: 0 }
  try {
    await tellDueDays({ id: user.id, role: user.role, employeeId: user.employee?.id ?? null })
  } catch (e) {
    console.error('due notices failed', e)
  }
  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        kind: true,
        text: true,
        createdAt: true,
        readAt: true,
        project: { select: { id: true, number: true, name: true } },
        actor: { select: { username: true, employee: { select: { firstName: true, lastName: true } } } },
      },
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ])
  return {
    unread,
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      text: row.text,
      createdAt: row.createdAt,
      fresh: row.readAt === null,
      project: row.project,
      actor: row.actor ? (row.actor.employee ? `${row.actor.employee.firstName} ${row.actor.employee.lastName}`.trim() : row.actor.username) : null,
    })),
  }
}

/** The user opened the bell: nothing in it is new any more. */
export async function markNotificationsRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
}
