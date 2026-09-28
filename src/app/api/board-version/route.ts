import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * A fingerprint of everything the board draws: how many projects there are,
 * when one last changed, the last line of the audit log (a comment, a file, a
 * move, a list) and when a board was last changed. The board asks for it every few
 * seconds and reloads only when it differs — what a colleague does shows up
 * on everybody's board, the way it does in Trello, without the board reading
 * every card again and again.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role === 'EMPLOYEE') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // A list renamed, added, taken away or dragged is written to the audit log too.
  const [projects, lastAudit, boards] = await Promise.all([
    db.project.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    db.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }),
    db.board.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
  ])
  const v = [
    projects._count._all,
    projects._max.updatedAt?.getTime() ?? 0,
    lastAudit?.id ?? '',
    boards._count._all,
    boards._max.updatedAt?.getTime() ?? 0,
  ].join(':')
  return NextResponse.json({ v }, { headers: { 'Cache-Control': 'no-store' } })
}
