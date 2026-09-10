import { getTranslations } from 'next-intl/server'
import { createCustomer } from '../actions'
import { CustomerForm } from '../customer-form'

export default async function NewCustomerPage() {
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
