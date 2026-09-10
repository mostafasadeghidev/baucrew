import { getTranslations } from 'next-intl/server'
import { createEmployee, listSkills } from '../actions'
import { EmployeeForm } from '../employee-form'

export default async function NewEmployeePage() {
  const [t, skills] = await Promise.all([getTranslations('employees'), listSkills()])

  return (
    <div className="space-y-4">
      <EmployeeForm
        action={createEmployee}
        cancelHref="/employees"
        title={t('createTitle')}
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
