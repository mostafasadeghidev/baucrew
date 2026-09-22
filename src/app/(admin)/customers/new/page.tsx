import { getTranslations } from 'next-intl/server'
import { createCustomer } from '../actions'
import { CustomerForm } from '../customer-form'
import { requireManagement } from '@/lib/authz'

export default async function NewCustomerPage() {
  await requireManagement()
  const t = await getTranslations('customers')

  return (
    <div className="space-y-4">
      <CustomerForm
        action={createCustomer}
        cancelHref="/customers"
        title={t('createTitle')}
        initial={{
          name: '',
          company: '',
          number: '',
          contactPerson: '',
          phone: '',
          email: '',
          street: '',
          postalCode: '',
          city: '',
          latitude: null,
          longitude: null,
          country: 'Deutschland',
          notes: '',
        }}
      />
    </div>
  )
}
