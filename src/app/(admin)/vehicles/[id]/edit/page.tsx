import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { updateVehicle } from '../../actions'
import { VehicleForm } from '../../vehicle-form'

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const t = await getTranslations('vehicles')
  const vehicle = await db.vehicle.findUnique({ where: { id } })
  if (!vehicle) notFound()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('editTitle')} — {vehicle.name}
      </h1>
      <VehicleForm
        action={updateVehicle.bind(null, vehicle.id)}
        cancelHref={`/vehicles/${vehicle.id}`}
        initial={{
          name: vehicle.name,
          licensePlate: vehicle.licensePlate ?? '',
          type: vehicle.type ?? '',
          status: vehicle.status,
          active: vehicle.active,
          notes: vehicle.notes ?? '',
        }}
      />
    </div>
  )
}
