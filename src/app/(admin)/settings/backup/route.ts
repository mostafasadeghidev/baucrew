import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

// Admin-only full JSON export of all business data (sessions excluded).
// Complements the pg_dump-based database backups described in DEPLOYMENT.md.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const [
    users,
    employees,
    customers,
    vehicles,
    workCategories,
    catalogItems,
    projects,
    projectWorkCategories,
    projectEmployees,
    projectVehicles,
    projectItems,
    projectTemplates,
    templateItems,
    scheduleEntries,
    scheduleEntryEmployees,
    scheduleEntryVehicles,
    notes,
    documents,
    appSettings,
    auditLogs,
  ] = await Promise.all([
    db.user.findMany(),
    db.employee.findMany(),
    db.customer.findMany(),
    db.vehicle.findMany(),
    db.workCategory.findMany(),
    db.catalogItem.findMany(),
    db.project.findMany(),
    db.projectWorkCategory.findMany(),
    db.projectEmployee.findMany(),
    db.projectVehicle.findMany(),
    db.projectItem.findMany(),
    db.projectTemplate.findMany(),
    db.templateItem.findMany(),
    db.scheduleEntry.findMany(),
    db.scheduleEntryEmployee.findMany(),
    db.scheduleEntryVehicle.findMany(),
    db.note.findMany(),
    db.document.findMany(),
    db.appSetting.findMany(),
    db.auditLog.findMany(),
  ])

  const backup = {
    format: 'baucrew-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      users,
      employees,
      customers,
      vehicles,
      workCategories,
      catalogItems,
      projects,
      projectWorkCategories,
      projectEmployees,
      projectVehicles,
      projectItems,
      projectTemplates,
      templateItems,
      scheduleEntries,
      scheduleEntryEmployees,
      scheduleEntryVehicles,
      notes,
      documents,
      appSettings,
      auditLogs,
    },
  }

  await audit({ userId: user.id, action: 'settings.backup', entity: 'System', entityId: 'backup' })

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="backup_${date}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
