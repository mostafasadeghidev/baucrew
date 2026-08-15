'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'

const optional = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v ? v : null))

const coord = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
  })

const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: optional,
  contactPerson: optional,
  phone: optional,
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    .transform((v) => (v ? v : null)),
  street: optional,
  postalCode: optional,
  city: optional,
  latitude: coord,
  longitude: coord,
  country: optional,
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((v) => (v ? v : null)),
})

export type CustomerFormState = { error?: 'nameRequired' | 'saveFailed' }

function parseCustomerForm(formData: FormData) {
  return customerSchema.safeParse({
    name: formData.get('name') ?? '',
    company: formData.get('company') ?? '',
    contactPerson: formData.get('contactPerson') ?? '',
    phone: formData.get('phone') ?? '',
    email: formData.get('email') ?? '',
    street: formData.get('street') ?? '',
    postalCode: formData.get('postalCode') ?? '',
    city: formData.get('city') ?? '',
    latitude: formData.get('latitude') ?? '',
    longitude: formData.get('longitude') ?? '',
    country: formData.get('country') ?? '',
    notes: formData.get('notes') ?? '',
  })
}

export async function createCustomer(
  _prev: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const user = await requireManagement()
  const parsed = parseCustomerForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues.some((i) => i.path[0] === 'name') ? 'nameRequired' : 'saveFailed' }
  }
  const customer = await db.customer.create({ data: parsed.data })
  await audit({
    userId: user.id,
    action: 'customer.create',
    entity: 'Customer',
    entityId: customer.id,
    newValue: customer.name,
  })
  revalidatePath('/customers')
  redirect(`/customers/${customer.id}`)
}

export async function updateCustomer(
  id: string,
  _prev: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const user = await requireManagement()
  const parsed = parseCustomerForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues.some((i) => i.path[0] === 'name') ? 'nameRequired' : 'saveFailed' }
  }
  const before = await db.customer.findUnique({ where: { id } })
  if (!before) return { error: 'saveFailed' }
  await db.customer.update({ where: { id }, data: parsed.data })
  await audit({
    userId: user.id,
    action: 'customer.update',
    entity: 'Customer',
    entityId: id,
    oldValue: before.name,
    newValue: parsed.data.name,
  })
  revalidatePath('/customers')
  revalidatePath(`/customers/${id}`)
  redirect(`/customers/${id}`)
}

/**
 * Creates a customer from the inline modal (e.g. inside the project form)
 * and returns it instead of redirecting, so the caller can select it.
 */
export async function createCustomerInline(input: {
  name: string
  company: string
  contactPerson: string
  phone: string
  email: string
  street: string
  postalCode: string
  city: string
  latitude?: number | null
  longitude?: number | null
}): Promise<
  | { id: string; name: string; street: string | null; postalCode: string | null; city: string | null; phone: string | null; latitude: number | null; longitude: number | null }
  | { error: 'nameRequired' | 'saveFailed' }
> {
  const user = await requireManagement()
  const parsed = customerSchema.safeParse({
    ...input,
    country: 'Deutschland',
    notes: '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues.some((i) => i.path[0] === 'name') ? 'nameRequired' : 'saveFailed' }
  }
  const customer = await db.customer.create({ data: parsed.data })
  await audit({
    userId: user.id,
    action: 'customer.create',
    entity: 'Customer',
    entityId: customer.id,
    newValue: customer.name,
  })
  revalidatePath('/customers')
  return {
    id: customer.id,
    name: customer.name,
    street: customer.street,
    postalCode: customer.postalCode,
    city: customer.city,
    phone: customer.phone,
    latitude: customer.latitude,
    longitude: customer.longitude,
  }
}

export type DeleteState = { error?: string }

export async function deleteCustomer(
  id: string,
  _prev: DeleteState,
  _formData: FormData
): Promise<DeleteState> {
  const user = await requireManagement()
  const projectCount = await db.project.count({ where: { customerId: id } })
  if (projectCount > 0) return { error: 'cannotDeleteHasProjects' }
  const customer = await db.customer.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'customer.delete',
    entity: 'Customer',
    entityId: id,
    oldValue: customer.name,
  })
  revalidatePath('/customers')
  redirect('/customers')
}
