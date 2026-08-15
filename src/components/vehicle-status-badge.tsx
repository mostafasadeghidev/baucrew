import { getTranslations } from 'next-intl/server'
import type { VehicleStatus } from '@/generated/prisma/enums'

export const VEHICLE_STATUS_STYLES: Record<VehicleStatus, string> = {
  AVAILABLE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  MAINTENANCE: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  OUT_OF_SERVICE: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

export async function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const t = await getTranslations('vehicleStatus')
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${VEHICLE_STATUS_STYLES[status]}`}
    >
      {t(status)}
    </span>
  )
}
