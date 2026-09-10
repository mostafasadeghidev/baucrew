import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { createUser } from '../../actions'
import { UserForm } from '../../user-form'

export default async function NewUserPage() {
  await requireAdmin()
  const t = await getTranslations('settings')
  const employees = await db.employee.findMany({
    where: { userId: null, active: true },
    orderBy: { firstName: 'asc' },
    select: { id: true, firstName: true, lastName: true },
  })

  return (
    <div className="space-y-4">
      <UserForm
        action={createUser}
        isNew
        isSelf={false}
        cancelHref="/settings?tab=accounts"
        title={t('createUserTitle')}
        employees={employees.map((e) => ({
          value: e.id,
          label: `${e.firstName} ${e.lastName}`.trim(),
        }))}
        initial={{
          username: '',
          role: 'EMPLOYEE',
          canViewFinancials: false,
          active: true,
          employeeId: '',
        }}
      />
    </div>
  )
}
