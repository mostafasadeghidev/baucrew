import { getTranslations } from 'next-intl/server'
import type { ProjectStatus } from '@/generated/prisma/enums'

export const STATUS_STYLES: Record<ProjectStatus, string> = {
  LEAD: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300',
  QUOTED: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  APPROVED: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
  PLANNED: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  IN_PROGRESS: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  INVOICED: 'bg-teal-500/15 text-teal-700 dark:text-teal-400',
  PAID: 'bg-green-500/15 text-green-700 dark:text-green-400',
  CANCELLED: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

export async function StatusBadge({ status }: { status: ProjectStatus }) {
  const t = await getTranslations('status')
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {t(status)}
    </span>
  )
}
