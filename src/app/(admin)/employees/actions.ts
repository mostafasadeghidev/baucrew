'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireManagement, requireAdmin } from '@/lib/authz'
import { hashPassword } from '@/lib/auth'
import { Role } from '@/generated/prisma/enums'
import { audit } from '@/lib/audit'
import { isAbsenceType } from '@/lib/absences'
import { validInterval } from '@/lib/time-entries'

const optional = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v ? v : null))

const employeeSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: optional,
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    .transform((v) => (v ? v : null)),
  skills: z
    .string()
    .trim()
    .max(1000)
    .transform((v) =>
      v
        .split(/[,\u060C]/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  active: z.string().transform((v) => v === 'on'),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((v) => (v ? v : null)),
})

export type EmployeeFormState = { error?: 'nameRequired' | 'saveFailed' }

function parseEmployeeForm(formData: FormData) {
  return employeeSchema.safeParse({
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    phone: formData.get('phone') ?? '',
    email: formData.get('email') ?? '',
    skills: formData.get('skills') ?? '',
    active: formData.get('active') ?? '',
    notes: formData.get('notes') ?? '',
  })
}

function errorKey(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>
): NonNullable<EmployeeFormState['error']> {
  return issues.some((i) => i.path[0] === 'firstName' || i.path[0] === 'lastName')
    ? 'nameRequired'
    : 'saveFailed'
}

export async function createEmployee(
  _prev: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const user = await requireManagement()
  const parsed = parseEmployeeForm(formData)
  if (!parsed.success) return { error: errorKey(parsed.error.issues) }
  const employee = await db.employee.create({ data: parsed.data })
  await audit({
    userId: user.id,
    action: 'employee.create',
    entity: 'Employee',
    entityId: employee.id,
    newValue: `${employee.firstName} ${employee.lastName}`,
  })
  revalidatePath('/employees')
  redirect(`/employees/${employee.id}`)
}

export async function updateEmployee(
  id: string,
  _prev: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const user = await requireManagement()
  const parsed = parseEmployeeForm(formData)
  if (!parsed.success) return { error: errorKey(parsed.error.issues) }
  const before = await db.employee.findUnique({ where: { id } })
  if (!before) return { error: 'saveFailed' }
  await db.employee.update({ where: { id }, data: parsed.data })
  if (before.active !== parsed.data.active) {
    await audit({
      userId: user.id,
      action: 'employee.active',
      entity: 'Employee',
      entityId: id,
      field: 'active',
      oldValue: String(before.active),
      newValue: String(parsed.data.active),
    })
  }
  await audit({
    userId: user.id,
    action: 'employee.update',
    entity: 'Employee',
    entityId: id,
    newValue: `${parsed.data.firstName} ${parsed.data.lastName}`,
  })
  revalidatePath('/employees')
  revalidatePath(`/employees/${id}`)
  redirect(`/employees/${id}`)
}

// ── Employee user account (managed on the employee page) ─────

export type AccountState = {
  error?: 'usernameTaken' | 'usernameInvalid' | 'passwordTooShort' | 'saveFailed'
  /** Timestamp of the last successful save — lets the UI show a transient "Saved" message. */
  savedAt?: number
}

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/

function isUniqueConflict(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
}

export async function createEmployeeAccount(
  employeeId: string,
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const admin = await requireAdmin()
  const username = String(formData.get('username') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const roleRaw = String(formData.get('role') ?? 'EMPLOYEE')
  const role = roleRaw in Role ? (roleRaw as Role) : 'EMPLOYEE'
  const canViewFinancials = formData.get('canViewFinancials') === 'on'
  if (!USERNAME_RE.test(username)) return { error: 'usernameInvalid' }
  if (password.length < 8) return { error: 'passwordTooShort' }

  const employee = await db.employee.findUnique({ where: { id: employeeId } })
  if (!employee || employee.userId) return { error: 'saveFailed' }

  try {
    const user = await db.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        role,
        canViewFinancials: role === 'ADMIN' ? true : canViewFinancials,
      },
    })
    await db.employee.update({ where: { id: employeeId }, data: { userId: user.id } })
    await audit({
      userId: admin.id,
      action: 'user.create',
      entity: 'User',
      entityId: user.id,
      newValue: `${username} (${role}) → ${employee.firstName} ${employee.lastName}`,
    })
  } catch (e) {
    return { error: isUniqueConflict(e) ? 'usernameTaken' : 'saveFailed' }
  }
  revalidatePath(`/employees/${employeeId}`)
  revalidatePath('/employees')
  revalidatePath('/settings')
  return { savedAt: Date.now() }
}

export async function updateEmployeeAccount(
  employeeId: string,
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const admin = await requireAdmin()
  const employee = await db.employee.findUnique({ where: { id: employeeId }, include: { user: true } })
  if (!employee?.user) return { error: 'saveFailed' }
  const user = employee.user
  const password = String(formData.get('password') ?? '')
  const roleRaw = String(formData.get('role') ?? user.role)
  const role = roleRaw in Role ? (roleRaw as Role) : user.role
  const canViewFinancials = formData.get('canViewFinancials') === 'on'
  const active = formData.get('active') === 'on'
  if (password && password.length < 8) return { error: 'passwordTooShort' }
  // Self-protection: an admin editing their own linked account cannot lock themselves out.
  const isSelf = user.id === admin.id
  if (isSelf && (role !== 'ADMIN' || !active)) return { error: 'saveFailed' }

  await db.user.update({
    where: { id: user.id },
    data: {
      role,
      canViewFinancials: role === 'ADMIN' ? true : canViewFinancials,
      active,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  })
  if (password) {
    // Invalidate other sessions of this user (keep the admin's own current one when self)
    await db.session.deleteMany({ where: { userId: user.id } })
    await audit({ userId: admin.id, action: 'user.password', entity: 'User', entityId: user.id })
  }
  if (user.role !== role) {
    await audit({ userId: admin.id, action: 'user.role', entity: 'User', entityId: user.id, field: 'role', oldValue: user.role, newValue: role })
  }
  await audit({ userId: admin.id, action: 'user.update', entity: 'User', entityId: user.id, newValue: user.username })
  revalidatePath(`/employees/${employeeId}`)
  revalidatePath('/employees')
  revalidatePath('/settings')
  return { savedAt: Date.now() }
}

export type DeleteState = { error?: string }

export async function deleteEmployee(
  id: string,
  _prev: DeleteState,
  _formData: FormData
): Promise<DeleteState> {
  const user = await requireManagement()
  const [projectCount, scheduleCount, managedCount] = await Promise.all([
    db.projectEmployee.count({ where: { employeeId: id } }),
    db.scheduleEntryEmployee.count({ where: { employeeId: id } }),
    db.project.count({ where: { managerId: id } }),
  ])
  if (projectCount > 0 || scheduleCount > 0 || managedCount > 0) {
    return { error: 'cannotDeleteInUse' }
  }
  const employee = await db.employee.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'employee.delete',
    entity: 'Employee',
    entityId: id,
    oldValue: `${employee.firstName} ${employee.lastName}`,
  })
  revalidatePath('/employees')
  redirect('/employees')
}

// ── Skills (free text on employees; managed as a set of distinct values) ──

export type SkillState = { error?: 'nameRequired' | 'saveFailed'; savedAt?: number }

/** Distinct skills across all employees with how many employees have each. */
export async function listSkills(): Promise<Array<{ name: string; count: number }>> {
  const employees = await db.employee.findMany({ select: { skills: true } })
  const counts = new Map<string, number>()
  for (const e of employees) for (const s of e.skills) {
    const k = s.trim()
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export async function renameSkill(from: string, _prev: SkillState, formData: FormData): Promise<SkillState> {
  const user = await requireManagement()
  const to = String(formData.get('name') ?? '').trim().slice(0, 100)
  if (!to) return { error: 'nameRequired' }
  if (to === from) return { savedAt: Date.now() }
  const affected = await db.employee.findMany({ where: { skills: { has: from } }, select: { id: true, skills: true } })
  for (const e of affected) {
    const next = [...new Set(e.skills.map((s) => (s === from ? to : s)))]
    await db.employee.update({ where: { id: e.id }, data: { skills: next } })
  }
  await audit({ userId: user.id, action: 'skill.rename', entity: 'Employee', entityId: from, oldValue: from, newValue: `${to} (${affected.length})` })
  revalidatePath('/employees')
  return { savedAt: Date.now() }
}

export async function removeSkill(name: string, _prev: { error?: string }, _formData: FormData): Promise<{ error?: string }> {
  const user = await requireManagement()
  const affected = await db.employee.findMany({ where: { skills: { has: name } }, select: { id: true, skills: true } })
  for (const e of affected) {
    await db.employee.update({ where: { id: e.id }, data: { skills: e.skills.filter((s) => s !== name) } })
  }
  await audit({ userId: user.id, action: 'skill.remove', entity: 'Employee', entityId: name, oldValue: `${name} (${affected.length})` })
  revalidatePath('/employees')
  return {}
}

// ── Absences (holiday, sick, other) ─────────────────────────

export type AbsenceState = { error?: 'invalidRange' | 'saveFailed'; savedAt?: number }

export async function createAbsence(employeeId: string, formData: FormData): Promise<AbsenceState> {
  const user = await requireManagement()
  const type = String(formData.get('type') ?? '')
  const start = String(formData.get('startDate') ?? '')
  const end = String(formData.get('endDate') ?? '') || start
  if (!isAbsenceType(type) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
    return { error: 'saveFailed' }
  if (end < start) return { error: 'invalidRange' }

  const absence = await db.absence.create({
    data: {
      employeeId,
      startDate: new Date(`${start}T00:00:00Z`),
      endDate: new Date(`${end}T00:00:00Z`),
      type,
      note: String(formData.get('note') ?? '').trim().slice(0, 300) || null,
    },
  })
  await audit({
    userId: user.id,
    action: 'absence.create',
    entity: 'Employee',
    entityId: employeeId,
    newValue: `${type} ${start} – ${end}`,
  })
  revalidatePath(`/employees/${employeeId}`)
  revalidatePath('/schedule')
  revalidatePath('/dashboard')
  return { savedAt: Date.now(), ...(absence ? {} : {}) }
}

export async function deleteAbsence(
  id: string,
  _prev: { error?: string },
  _formData: FormData
): Promise<{ error?: string }> {
  const user = await requireManagement()
  const absence = await db.absence.findUnique({ where: { id } })
  if (!absence) return { error: 'saveFailed' }
  await db.absence.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'absence.delete',
    entity: 'Employee',
    entityId: absence.employeeId,
    oldValue: `${absence.type} ${absence.startDate.toISOString().slice(0, 10)} – ${absence.endDate.toISOString().slice(0, 10)}`,
  })
  revalidatePath(`/employees/${absence.employeeId}`)
  revalidatePath('/schedule')
  revalidatePath('/dashboard')
  return {}
}

// ── Time entries (office corrections and manual bookings) ───

export type TimeEntryState = { error?: 'invalidRange' | 'saveFailed'; savedAt?: number }

export async function addTimeEntry(employeeId: string, formData: FormData): Promise<TimeEntryState> {
  const user = await requireManagement()
  const date = String(formData.get('date') ?? '')
  const from = String(formData.get('from') ?? '')
  const to = String(formData.get('to') ?? '')
  const projectId = String(formData.get('projectId') ?? '') || null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to))
    return { error: 'saveFailed' }

  const startedAt = new Date(`${date}T${from}:00`)
  const endedAt = new Date(`${date}T${to}:00`)
  if (!validInterval(startedAt, endedAt)) return { error: 'invalidRange' }

  await db.timeEntry.create({
    data: {
      employeeId,
      projectId,
      startedAt,
      endedAt,
      note: String(formData.get('note') ?? '').trim().slice(0, 300) || null,
      source: 'office',
      createdById: user.id,
    },
  })
  await audit({
    userId: user.id,
    action: 'time.add',
    entity: 'Employee',
    entityId: employeeId,
    newValue: `${date} ${from}–${to}`,
  })
  revalidatePath(`/employees/${employeeId}`)
  return { savedAt: Date.now() }
}

export async function deleteTimeEntry(
  id: string,
  _prev: { error?: string },
  _formData: FormData
): Promise<{ error?: string }> {
  const user = await requireManagement()
  const entry = await db.timeEntry.findUnique({ where: { id } })
  if (!entry) return { error: 'saveFailed' }
  await db.timeEntry.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'time.delete',
    entity: 'Employee',
    entityId: entry.employeeId,
    oldValue: entry.startedAt.toISOString(),
  })
  revalidatePath(`/employees/${entry.employeeId}`)
  return {}
}
