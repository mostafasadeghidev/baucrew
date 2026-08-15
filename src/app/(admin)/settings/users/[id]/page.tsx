import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { deleteUser, updateUser } from '../../actions'
import { DeleteButton } from '@/components/delete-button'
import { UserForm } from '../../user-form'

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const admin = await requireAdmin()
  const { id } = await params
  const [t, tc] = await Promise.all([getTranslations('settings'), getTranslations('common')])

  const [user, employees] = await Promise.all([
    db.user.findUnique({ where: { id }, include: { employee: { select: { id: true } } } }),
    db.employee.findMany({
      where: { OR: [{ userId: null }, { userId: id }], active: true },
      orderBy: { firstName: 'asc' },
      select: { id: true, firstName: true, lastName: true },
    }),
  ])
  if (!user) notFound()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('editUserTitle')} — {user.username}
        </h1>
        <DeleteButton
          action={deleteUser.bind(null, user.id)}
          label={t('deleteUser')}
          confirmMessage={t('deleteUserConfirm')}
          errorLabels={{
            selfDelete: t('cannotDeleteSelf'),
            lastAdmin: t('cannotDeleteLastAdmin'),
            saveFailed: tc('saveFailed'),
          }}
        />
      </div>
      <UserForm
        action={updateUser.bind(null, user.id)}
        isNew={false}
        isSelf={user.id === admin.id}
        employees={employees.map((e) => ({
          value: e.id,
          label: `${e.firstName} ${e.lastName}`.trim(),
        }))}
        initial={{
          username: user.username,
          role: user.role,
          canViewFinancials: user.canViewFinancials,
          active: user.active,
          employeeId: user.employee?.id ?? '',
        }}
      />
    </div>
  )
}
