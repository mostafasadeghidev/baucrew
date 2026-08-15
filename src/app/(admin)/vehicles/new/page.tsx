import { getTranslations } from 'next-intl/server'
import { createVehicle } from '../actions'
import { VehicleForm } from '../vehicle-form'

export default async function NewVehiclePage() {
  const t = await getTranslations('vehicles')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h1>
      <VehicleForm
        action={createVehicle}
        cancelHref="/vehicles"
        initial={{
          name: '',
          licensePlate: '',
          type: '',
          status: 'AVAILABLE',
          active: true,
          notes: '',
        }}
      />
    </div>
  )
}
