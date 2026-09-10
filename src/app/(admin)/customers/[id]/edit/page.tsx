import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { updateCustomer } from '../../actions'
import { CustomerForm } from '../../customer-form'

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const t = await getTranslations('customers')
  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) notFound()

  return (
    <div className="space-y-4">
      <CustomerForm
        action={updateCustomer.bind(null, customer.id)}
        cancelHref={`/customers/${customer.id}`}
        title={`${t('editTitle')} — ${customer.name}`}
        initial={{
          name: customer.name,
          company: customer.company ?? '',
          contactPerson: customer.contactPerson ?? '',
          phone: customer.phone ?? '',
          email: customer.email ?? '',
          street: customer.street ?? '',
          postalCode: customer.postalCode ?? '',
          city: customer.city ?? '',
          latitude: customer.latitude,
          longitude: customer.longitude,
          country: customer.country ?? '',
          notes: customer.notes ?? '',
        }}
      />
    </div>
  )
}
