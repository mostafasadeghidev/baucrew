import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { exportBackup } from '@/lib/backup'

// Admin-only export of everything: every table (sessions excluded) and the
// documents' files, as one JSON file that /settings restores on another
// installation. Complements the pg_dump-based database backups.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const backup = await exportBackup()
  await audit({ userId: user.id, action: 'settings.backup', entity: 'System', entityId: 'backup' })

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(backup), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="baucrew-backup-${date}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
