import { getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { DeviceForm } from '../device-form'
import { createDevice } from '../actions'

export default async function NewDevicePage() {
  await requireManagement()
  const t = await getTranslations('devices')
  const used = await db.device.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ['category'],
  })

  return (
    <div className="space-y-4">
      <div>
        <BackLink href="/devices" label={t('title')} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('newDevice')}</h1>
      </div>
      <DeviceForm
        action={createDevice}
        categories={used.map((u) => u.category!).filter(Boolean)}
        initial={{
          name: '',
          inventoryNo: '',
          category: '',
          storageLocation: '',
          videoUrl: '',
          notes: '',
          active: true,
        }}
      />
    </div>
  )
}
