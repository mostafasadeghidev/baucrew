import { getTranslations } from 'next-intl/server'
import { createVehicle } from '../actions'
import { VehicleForm } from '../vehicle-form'

export default async function NewVehiclePage() {
  const t = await getTranslations('vehicles')

  return (
    <div className="space-y-4">
      <VehicleForm
        action={createVehicle}
        cancelHref="/vehicles"
        title={t('createTitle')}
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
