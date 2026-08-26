'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createHash } from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { hashPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { Role } from '@/generated/prisma/enums'
import type { SaveState } from '@/components/saved-form'
import { deleteUserBlockReason } from '@/lib/user-guards'
import { PREP_TAB_KEY, prepTabConfigFromForm, serializePrepTabConfig } from '@/lib/prep-tab'
import { normalizeAccent } from "@/lib/branding";
import {
  optionListFromForm,
  parseOptionList,
  serializeOptionList,
  type OptionList,
} from "@/lib/option-lists";

export type UserFormState = {
  error?: 'usernameTaken' | 'usernameInvalid' | 'passwordTooShort' | 'selfProtected' | 'saveFailed'
}

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/

const baseUserSchema = z.object({
  username: z.string().trim().toLowerCase(),
  role: z.enum(Role),
  canViewFinancials: z.string().transform((v) => v === 'on'),
  active: z.string().transform((v) => v === 'on'),
  employeeId: z.string().transform((v) => (v ? v : null)),
  password: z.string(),
})

function parseUserForm(formData: FormData) {
  return baseUserSchema.safeParse({
    username: formData.get('username') ?? '',
    role: formData.get('role') ?? 'EMPLOYEE',
    canViewFinancials: formData.get('canViewFinancials') ?? '',
    active: formData.get('active') ?? '',
    employeeId: formData.get('employeeId') ?? '',
    password: formData.get('password') ?? '',
  })
}

async function linkEmployee(userId: string, employeeId: string | null) {
  // Unlink any employee currently attached to this account, then attach the new one.
  await db.employee.updateMany({ where: { userId }, data: { userId: null } })
  if (employeeId) {
    await db.employee.update({ where: { id: employeeId }, data: { userId } })
  }
}

function isUniqueConflict(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
}

export async function createUser(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const admin = await requireAdmin()
  const parsed = parseUserForm(formData)
  if (!parsed.success) return { error: 'saveFailed' }
  const d = parsed.data
  if (!USERNAME_RE.test(d.username)) return { error: 'usernameInvalid' }
  if (d.password.length < 8) return { error: 'passwordTooShort' }

  let user
  try {
    user = await db.user.create({
      data: {
        username: d.username,
        passwordHash: await hashPassword(d.password),
        role: d.role,
        canViewFinancials: d.role === 'ADMIN' ? true : d.canViewFinancials,
        active: d.active,
      },
    })
  } catch (e) {
    return { error: isUniqueConflict(e) ? 'usernameTaken' : 'saveFailed' }
  }
  await linkEmployee(user.id, d.employeeId)
  await audit({
    userId: admin.id,
    action: 'user.create',
    entity: 'User',
    entityId: user.id,
    newValue: `${d.username} (${d.role})`,
  })
  revalidatePath('/settings')
  redirect('/settings')
}

export async function updateUser(
  id: string,
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const admin = await requireAdmin()
  const parsed = parseUserForm(formData)
  if (!parsed.success) return { error: 'saveFailed' }
  const d = parsed.data

  const before = await db.user.findUnique({ where: { id } })
  if (!before) return { error: 'saveFailed' }

  // Nobody can lock themselves out or demote themselves.
  if (id === admin.id && (d.role !== 'ADMIN' || !d.active)) {
    return { error: 'selfProtected' }
  }
  if (d.password && d.password.length < 8) return { error: 'passwordTooShort' }

  await db.user.update({
    where: { id },
    data: {
      role: d.role,
      canViewFinancials: d.role === 'ADMIN' ? true : d.canViewFinancials,
      active: d.active,
      ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}),
    },
  })

  // A password change invalidates every existing session of that user —
  // except the admin's own current session when changing their own password.
  if (d.password) {
    let keepTokenHash: string | undefined
    if (id === admin.id) {
      const store = await cookies()
      const token = store.get('session')?.value
      if (token) keepTokenHash = createHash('sha256').update(token).digest('hex')
    }
    await db.session.deleteMany({
      where: { userId: id, ...(keepTokenHash ? { tokenHash: { not: keepTokenHash } } : {}) },
    })
  }

  await linkEmployee(id, d.employeeId)

  if (before.role !== d.role) {
    await audit({
      userId: admin.id,
      action: 'user.role',
      entity: 'User',
      entityId: id,
      field: 'role',
      oldValue: before.role,
      newValue: d.role,
    })
  }
  if (d.password) {
    await audit({ userId: admin.id, action: 'user.password', entity: 'User', entityId: id })
  }
  await audit({
    userId: admin.id,
    action: 'user.update',
    entity: 'User',
    entityId: id,
    newValue: before.username,
  })
  revalidatePath('/settings')
  redirect('/settings')
}

export type DeleteUserState = { error?: 'selfDelete' | 'lastAdmin' | 'saveFailed' }

/**
 * Deletes a user account (sessions cascade; audit entries, notes and the
 * employee link are kept with the user reference set to null).
 * Guards: not the acting admin's own account, and never the last active admin.
 */
export async function deleteUser(
  id: string,
  _prev: { error?: string },
  _formData: FormData
): Promise<DeleteUserState> {
  const admin = await requireAdmin()
  const target = await db.user.findUnique({ where: { id }, include: { employee: { select: { id: true } } } })
  if (!target) return { error: 'saveFailed' }
  const otherActiveAdmins = await db.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } })
  const block = deleteUserBlockReason({ actorId: admin.id, target, otherActiveAdmins })
  if (block) return { error: block }

  await db.user.delete({ where: { id } })
  await audit({
    userId: admin.id,
    action: 'user.delete',
    entity: 'User',
    entityId: id,
    oldValue: `${target.username} (${target.role})`,
  })
  revalidatePath('/settings')
  revalidatePath('/employees')
  if (target.employee) {
    revalidatePath(`/employees/${target.employee.id}`)
    redirect(`/employees/${target.employee.id}`)
  }
  redirect('/settings')
}

// ── Logo ─────────────────────────────────────────────────────

export type LogoState = { error?: 'logoTooLarge' | 'logoInvalidType' | 'saveFailed'; savedAt?: number }

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const LOGO_MAX_BYTES = 1024 * 1024

export async function uploadLogo(_prev: LogoState, formData: FormData): Promise<LogoState> {
  const admin = await requireAdmin()
  const file = formData.get('logo')
  if (!(file instanceof File) || file.size === 0) return { error: 'saveFailed' }
  if (!LOGO_TYPES.includes(file.type)) return { error: 'logoInvalidType' }
  if (file.size > LOGO_MAX_BYTES) return { error: 'logoTooLarge' }

  const bytes = Buffer.from(await file.arrayBuffer())
  await db.appSetting.upsert({
    where: { key: 'logo' },
    update: { value: `data:${file.type};base64,${bytes.toString('base64')}` },
    create: { key: 'logo', value: `data:${file.type};base64,${bytes.toString('base64')}` },
  })
  await audit({ userId: admin.id, action: 'settings.logo', entity: 'AppSetting', entityId: 'logo' })
  revalidatePath('/', 'layout')
  return { savedAt: Date.now() }
}

export async function resetLogo(): Promise<void> {
  const admin = await requireAdmin()
  await db.appSetting.deleteMany({ where: { key: 'logo' } })
  await audit({
    userId: admin.id,
    action: 'settings.logo.reset',
    entity: 'AppSetting',
    entityId: 'logo',
  })
  revalidatePath('/', 'layout')
}

// ── Restore from backup ──────────────────────────────────────

export type RestoreState = { error?: 'restoreInvalid' | 'saveFailed' }

const BACKUP_TABLES = [
  'users',
  'employees',
  'customers',
  'vehicles',
  'workCategories',
  'catalogItems',
  'projects',
  'projectWorkCategories',
  'projectEmployees',
  'projectVehicles',
  'projectItems',
  'projectTemplates',
  'templateVehicles',
  'templateEmployees',
  'templateItems',
  'scheduleEntries',
  'scheduleEntryEmployees',
  'scheduleEntryVehicles',
  'notes',
  'documents',
  'appSettings',
  'auditLogs',
] as const

/**
 * Replaces ALL data with the contents of a backup file created by
 * /settings/backup. Runs in one transaction; all sessions are invalidated,
 * so every user (including the admin) has to sign in again afterwards.
 */
export async function restoreBackup(
  _prev: RestoreState,
  formData: FormData
): Promise<RestoreState> {
  await requireAdmin()
  const file = formData.get('backup')
  if (!(file instanceof File) || file.size === 0 || file.size > 100 * 1024 * 1024) {
    return { error: 'restoreInvalid' }
  }

  let parsed: { format?: string; version?: number; exportedAt?: string; tables?: Record<string, unknown> }
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return { error: 'restoreInvalid' }
  }
  if (parsed?.format !== 'baucrew-backup' || parsed.version !== 1 || !parsed.tables) {
    return { error: 'restoreInvalid' }
  }
  const tables = parsed.tables as Record<string, unknown[]>
  if (BACKUP_TABLES.some((key) => !Array.isArray(tables[key]))) {
    return { error: 'restoreInvalid' }
  }

  try {
    await db.$transaction([
      // wipe (children first)
      db.auditLog.deleteMany(),
      db.note.deleteMany(),
      db.document.deleteMany(),
      db.scheduleEntry.deleteMany(),
      db.projectVehicle.deleteMany(),
      db.projectItem.deleteMany(),
      db.templateItem.deleteMany(),
      db.templateVehicle.deleteMany(),
      db.templateEmployee.deleteMany(),
      db.projectTemplate.deleteMany(),
      db.project.deleteMany(),
      db.catalogItem.deleteMany(),
      db.vehicle.deleteMany(),
      db.customer.deleteMany(),
      db.employee.deleteMany(),
      db.session.deleteMany(),
      db.user.deleteMany(),
      db.workCategory.deleteMany(),
      db.appSetting.deleteMany(),
      // reinsert (parents first)
      db.user.createMany({ data: tables.users as never[] }),
      db.workCategory.createMany({ data: tables.workCategories as never[] }),
      db.customer.createMany({ data: tables.customers as never[] }),
      db.employee.createMany({ data: tables.employees as never[] }),
      db.vehicle.createMany({ data: tables.vehicles as never[] }),
      db.catalogItem.createMany({ data: tables.catalogItems as never[] }),
      db.projectTemplate.createMany({ data: tables.projectTemplates as never[] }),
      db.templateVehicle.createMany({ data: (tables.templateVehicles ?? []) as never[] }),
      db.templateEmployee.createMany({ data: (tables.templateEmployees ?? []) as never[] }),
      db.templateItem.createMany({ data: tables.templateItems as never[] }),
      db.project.createMany({ data: tables.projects as never[] }),
      db.projectWorkCategory.createMany({ data: tables.projectWorkCategories as never[] }),
      db.projectEmployee.createMany({ data: tables.projectEmployees as never[] }),
      db.projectVehicle.createMany({ data: (tables.projectVehicles ?? []) as never[] }),
      db.projectItem.createMany({ data: tables.projectItems as never[] }),
      db.scheduleEntry.createMany({ data: tables.scheduleEntries as never[] }),
      db.scheduleEntryEmployee.createMany({ data: tables.scheduleEntryEmployees as never[] }),
      db.scheduleEntryVehicle.createMany({ data: tables.scheduleEntryVehicles as never[] }),
      db.note.createMany({ data: tables.notes as never[] }),
      db.document.createMany({ data: tables.documents as never[] }),
      db.appSetting.createMany({ data: tables.appSettings as never[] }),
      db.auditLog.createMany({ data: tables.auditLogs as never[] }),
    ])
  } catch (e) {
    console.error('restore failed', e)
    return { error: 'saveFailed' }
  }

  await audit({
    userId: null,
    action: 'settings.restore',
    entity: 'System',
    entityId: 'restore',
    newValue: parsed.exportedAt ?? null,
  })
  // All sessions are gone — back to the login page.
  redirect('/login')
}

// ── Company name ─────────────────────────────────────────────

export async function updateCompanyName(formData: FormData): Promise<SaveState> {
  const admin = await requireAdmin()
  const name = String(formData.get('companyName') ?? '')
    .trim()
    .slice(0, 100)
  if (name) {
    await db.appSetting.upsert({
      where: { key: 'companyName' },
      update: { value: name },
      create: { key: 'companyName', value: name },
    })
  } else {
    await db.appSetting.deleteMany({ where: { key: 'companyName' } })
  }
  await audit({
    userId: admin.id,
    action: 'settings.companyName',
    entity: 'AppSetting',
    entityId: 'companyName',
    newValue: name || null,
  })
  revalidatePath('/', 'layout')
  return { savedAt: Date.now() }
}

// ── Work categories ──────────────────────────────────────────

const categorySchema = z.object({
  nameDe: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  active: z.string().transform((v) => v === 'on'),
})

export async function createCategory(formData: FormData): Promise<SaveState> {
  const admin = await requireAdmin()
  const parsed = categorySchema.safeParse({
    nameDe: formData.get('nameDe') ?? '',
    nameEn: formData.get('nameEn') ?? '',
    active: 'on',
  })
  if (!parsed.success) return { error: 'saveFailed' }
  const maxSort = await db.workCategory.aggregate({ _max: { sortOrder: true } })
  const category = await db.workCategory.create({
    data: { ...parsed.data, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
  })
  await audit({
    userId: admin.id,
    action: 'workCategory.create',
    entity: 'WorkCategory',
    entityId: category.id,
    newValue: parsed.data.nameDe,
  })
  revalidatePath('/settings')
  return { savedAt: Date.now() }
}

export async function updateCategory(id: string, formData: FormData): Promise<SaveState> {
  const admin = await requireAdmin()
  const parsed = categorySchema.safeParse({
    nameDe: formData.get('nameDe') ?? '',
    nameEn: formData.get('nameEn') ?? '',
    active: formData.get('active') ?? '',
  })
  if (!parsed.success) return { error: 'saveFailed' }
  const before = await db.workCategory.findUnique({ where: { id } })
  if (!before) return { error: 'saveFailed' }
  await db.workCategory.update({ where: { id }, data: parsed.data })
  await audit({
    userId: admin.id,
    action: 'workCategory.update',
    entity: 'WorkCategory',
    entityId: id,
    oldValue: before.nameDe,
    newValue: parsed.data.nameDe,
  })
  revalidatePath('/settings')
  return { savedAt: Date.now() }
}

// ── Weather threshold ────────────────────────────────────────

export async function updateRainThreshold(formData: FormData): Promise<SaveState> {
  const admin = await requireAdmin()
  const n = Number(String(formData.get('rainThreshold') ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'saveFailed' }
  const value = String(Math.round(n))
  await db.appSetting.upsert({ where: { key: 'rainThreshold' }, update: { value }, create: { key: 'rainThreshold', value } })
  await audit({ userId: admin.id, action: 'settings.rainThreshold', entity: 'AppSetting', entityId: 'rainThreshold', newValue: value })
  revalidatePath('/dashboard')
  revalidatePath('/schedule')
  revalidatePath('/settings')
  return { savedAt: Date.now() }
}

// ── Project list: "Zur Vorbereitung" tab ─────────────────────

export async function updatePrepTab(formData: FormData): Promise<SaveState> {
  const admin = await requireAdmin()
  const value = serializePrepTabConfig(prepTabConfigFromForm((n) => formData.get(n)))
  await db.appSetting.upsert({ where: { key: PREP_TAB_KEY }, update: { value }, create: { key: PREP_TAB_KEY, value } })
  await audit({ userId: admin.id, action: 'settings.prepTab', entity: 'AppSetting', entityId: PREP_TAB_KEY, newValue: value })
  revalidatePath('/projects')
  revalidatePath('/settings')
  return { savedAt: Date.now() }
}

// ── Company colour ───────────────────────────────────────────

export async function updateAccentColor(formData: FormData): Promise<SaveState> {
  const admin = await requireAdmin()
  const value = normalizeAccent(String(formData.get("accentColor") ?? ""));
  await db.appSetting.upsert({
    where: { key: "accentColor" },
    update: { value },
    create: { key: "accentColor", value },
  });
  await audit({
    userId: admin.id,
    action: "settings.accentColor",
    entity: "AppSetting",
    entityId: "accentColor",
    newValue: value,
  });
  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}

// ── Configurable option lists (client / building types, item kinds) ──

async function updateOptionList(list: OptionList, formData: FormData): Promise<SaveState> {
  const admin = await requireAdmin();
  const entries = optionListFromForm((name) =>
    formData.getAll(name).map((v) => String(v)),
  );
  const value = serializeOptionList(
    entries.length > 0 ? entries : parseOptionList(list, null),
  );
  await db.appSetting.upsert({
    where: { key: list },
    update: { value },
    create: { key: list, value },
  });
  await audit({
    userId: admin.id,
    action: "settings.optionList",
    entity: "AppSetting",
    entityId: list,
    newValue: value.slice(0, 500),
  });
  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}

export async function updateClientTypes(formData: FormData): Promise<SaveState> {
  return updateOptionList("clientTypes", formData);
}

export async function updateBuildingTypes(formData: FormData): Promise<SaveState> {
  return updateOptionList("buildingTypes", formData);
}

export async function updateItemKinds(formData: FormData): Promise<SaveState> {
  return updateOptionList("itemKinds", formData);
}

export async function updateLeadSources(formData: FormData): Promise<SaveState> {
  return updateOptionList("leadSources", formData);
}

