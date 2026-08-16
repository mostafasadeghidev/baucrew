import { getTranslations } from 'next-intl/server'
import { createEmployee, listSkills } from '../actions'
import { EmployeeForm } from '../employee-form'

export default async function NewEmployeePage() {
  const [t, skills] = await Promise.all([getTranslations('employees'), listSkills()])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h1>
      <EmployeeForm
        action={createEmployee}
        cancelHref="/employees"
        skillSuggestions={skills.map((s) => s.name)}
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
