import 'server-only'
import { db } from './db'
import type { ApiIdentity } from './api-auth'
import { getCustomer, getProject } from './api-service'
import { forbiddenInput, isToolName } from './mcp-catalog'

// What a change the assistant wants to make looks like to the person asked to
// confirm it: which record, and each field from what it is to what it would
// be — names in place of ids. Read with the user's own rights; a record they
// may not see is named by what was typed, and the change itself is refused
// later by the same rules as everywhere.

export type ProposalValue = string | number | boolean | null | string[]

export type Proposal = {
  /** The record the change is made to: "2026-0048 · Musterhof Fassade". */
  target: string | null
  changes: Array<{ field: string; from?: ProposalValue; to: ProposalValue }>
}

/** Input keys that say where the change goes, not what it is. */
const TARGET_KEYS = new Set(['project', 'projectId', 'customerId', 'entryId', 'defectId'])

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim()

async function employeeNames(ids: string[]): Promise<string[]> {
  const rows = await db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } })
  return ids.map((id) => {
    const row = rows.find((r) => r.id === id)
    return row ? fullName(row) : id
  })
}

async function vehicleNames(ids: string[]): Promise<string[]> {
  const rows = await db.vehicle.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  return ids.map((id) => rows.find((r) => r.id === id)?.name ?? id)
}

const asValue = (v: unknown): ProposalValue =>
  v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    ? v
    : Array.isArray(v)
      ? v.map(String)
      : JSON.stringify(v)

const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Who and what a value names, in words. */
async function shown(field: string, value: unknown): Promise<ProposalValue> {
  if (field === 'employeeIds') return employeeNames(asIds(value))
  if (field === 'vehicleIds') return vehicleNames(asIds(value))
  if ((field === 'managerId' || field === 'assigneeId') && typeof value === 'string') return (await employeeNames([value]))[0]
  if (field === 'columnId' && typeof value === 'string') {
    const column = await db.boardColumn.findUnique({ where: { id: value }, select: { title: true, status: true, board: { select: { name: true } } } })
    return column ? `${column.board.name} → ${column.title ?? column.status}` : value
  }
  return asValue(value)
}

/** The project a change names, as the user may see it — or null. */
async function projectFor(ctx: ApiIdentity, ref: unknown) {
  if (typeof ref !== 'string' || !ref) return null
  try {
    return await getProject(ctx.user, ref)
  } catch {
    return null
  }
}

/** What each changed field of a project reads now, for "from → to". */
function currentProjectValue(p: Awaited<ReturnType<typeof getProject>>, field: string): ProposalValue | undefined {
  const values: Record<string, ProposalValue> = {
    name: p.name,
    jobNumber: p.jobNumber,
    status: p.status,
    isSub: p.isSub,
    street: p.address.street,
    postalCode: p.address.postalCode,
    city: p.address.city,
    plannedStart: p.plannedStart,
    plannedEnd: p.plannedEnd,
    dueDate: p.dueDate,
    inspectionDate: p.inspectionDate,
    executionWish: p.executionWish,
    workNote: p.workNote,
    description: p.description,
    managerId: p.manager?.name ?? null,
    ...('price' in p ? { price: (p.price as number | null) ?? null } : {}),
  }
  return field in values ? values[field] : undefined
}

export async function describeProposal(toolName: string, input: Record<string, unknown>, ctx: ApiIdentity): Promise<Proposal> {
  const fields = Object.entries(input).filter(([key, value]) => !TARGET_KEYS.has(key) && value !== undefined)
  // Money the user may not set is not shown as if it would be; the change is refused anyway.
  const hidden = new Set(isToolName(toolName) ? forbiddenInput(toolName, ctx.user, input) : [])
  let target: string | null = null
  let from: (field: string) => Promise<ProposalValue | undefined> = async () => undefined

  const project = await projectFor(ctx, input.project ?? input.projectId)
  if (project) {
    target = `${project.number} · ${project.name}`
    from = async (field) => currentProjectValue(project, field)
  } else if (typeof (input.project ?? input.projectId) === 'string') {
    target = String(input.project ?? input.projectId)
  }

  if (typeof input.customerId === 'string' && toolName === 'update_customer') {
    try {
      const customer = await getCustomer(ctx.user, input.customerId)
      target = customer.name
      from = async (field) => (field in customer ? asValue((customer as Record<string, unknown>)[field] ?? null) : undefined)
    } catch {
      target = input.customerId
    }
  }

  if (typeof input.entryId === 'string') {
    const entry = await db.scheduleEntry.findUnique({
      where: { id: input.entryId },
      select: {
        date: true,
        startTime: true,
        endTime: true,
        note: true,
        project: { select: { number: true, name: true } },
        employees: { select: { employeeId: true } },
        vehicles: { select: { vehicleId: true } },
      },
    })
    if (entry) {
      const day = entry.date.toISOString().slice(0, 10)
      target = `${entry.project.number} · ${entry.project.name} · ${day}`
      from = async (field) => {
        if (field === 'date') return day
        if (field === 'employeeIds') return employeeNames(entry.employees.map((e) => e.employeeId))
        if (field === 'vehicleIds') return vehicleNames(entry.vehicles.map((v) => v.vehicleId))
        if (field === 'startTime' || field === 'endTime' || field === 'note') return entry[field]
        return undefined
      }
    }
  }

  if (typeof input.defectId === 'string') {
    const defect = await db.defect.findUnique({
      where: { id: input.defectId },
      select: { title: true, resolvedAt: true, project: { select: { number: true } } },
    })
    if (defect) {
      target = `${defect.project.number} · ${defect.title}`
      from = async (field) => (field === 'resolved' ? defect.resolvedAt !== null : undefined)
    }
  }

  const changes: Proposal['changes'] = []
  // A new project's customer, by name.
  if (typeof input.customerId === 'string' && toolName !== 'update_customer') {
    const name = await getCustomer(ctx.user, input.customerId).then((c) => c.name, () => input.customerId as string)
    changes.push({ field: 'customerId', to: name })
  }
  for (const [field, value] of fields) {
    if (hidden.has(field)) continue
    const before = await from(field)
    const after = await shown(field, value)
    // A field that would stay as it is is no change to confirm.
    if (before !== undefined && JSON.stringify(before) === JSON.stringify(after)) continue
    changes.push(before === undefined ? { field, to: after } : { field, from: before, to: after })
  }
  return { target, changes }
}
