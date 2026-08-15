import { getTranslations } from 'next-intl/server'
import { createEmployee } from '../actions'
import { EmployeeForm } from '../employee-form'

export default async function NewEmployeePage() {
  const t = await getTranslations('employees')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h1>
      <EmployeeForm
        action={createEmployee}
        cancelHref="/employees"
        initial={{
          firstName: '',
          lastName: '',
          phone: '',
          email: '',
          skills: '',
          active: true,
          notes: '',
        }}
      />
    </div>
  )
}
