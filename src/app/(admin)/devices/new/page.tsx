import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { DeviceForm } from '../device-form'
import { createDevice } from '../actions'
import { PageBar, StickyHead } from '@/components/ui/page-panel'

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
      <StickyHead>
        <PageBar back={{ href: '/devices', label: t('title') }} title={t('newDevice')} />
      </StickyHead>
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
