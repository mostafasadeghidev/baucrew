import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { listSkills, updateEmployee } from '../../actions'
import { EmployeeForm } from '../../employee-form'

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [t, skills] = await Promise.all([getTranslations('employees'), listSkills()])
  const employee = await db.employee.findUnique({ where: { id } })
  if (!employee) notFound()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('editTitle')} — {employee.firstName} {employee.lastName}
      </h1>
      <EmployeeForm
        action={updateEmployee.bind(null, employee.id)}
        cancelHref={`/employees/${employee.id}`}
        skillSuggestions={skills.map((s) => s.name)}
        initial={{
          firstName: employee.firstName,
          lastName: employee.lastName,
          phone: employee.phone ?? '',
          email: employee.email ?? '',
          skills: employee.skills.join(', '),
          active: employee.active,
          notes: employee.notes ?? '',
        }}
      />
    </div>
  )
}
