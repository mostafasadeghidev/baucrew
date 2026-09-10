import { getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { DeviceForm } from '../device-form'
import { createDevice } from '../actions'
import { pageTitle, pageToolbar, StickyHead } from '@/components/ui/page-panel'

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
        <div className={pageToolbar}>
          <div>
            <BackLink href="/devices" label={t('title')} />
            <h1 className={`mt-1 ${pageTitle}`}>{t('newDevice')}</h1>
          </div>
        </div>
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
