import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { toDateInputValue } from '@/lib/format'
import { updateProject } from '../../actions'
import { ProjectForm } from '../../project-form'

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireManagement()
  const { id } = await params
  const t = await getTranslations('projects')
  const locale = await getLocale()

  const [project, customers, employees, vehicles, categories] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        workCategories: { select: { workCategoryId: true } },
        team: { select: { employeeId: true } },
        vehicles: { select: { vehicleId: true } },
      },
    }),
    db.customer.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, street: true, postalCode: true, city: true, phone: true, latitude: true, longitude: true },
    }),
    db.employee.findMany({
      where: { active: true },
      orderBy: { firstName: 'asc' },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.vehicle.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.workCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, nameDe: true, nameEn: true },
    }),
  ])
  if (!project) notFound()

  const showPrice = canViewFinancials(user)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('editTitle')} — {project.number}
      </h1>
      <ProjectForm
        action={updateProject.bind(null, project.id)}
        cancelHref={`/projects/${project.id}`}
        showPrice={showPrice}
        customers={customers.map((c) => ({ value: c.id, label: c.name }))}
        customerAddresses={Object.fromEntries(
          customers.map((c) => [
            c.id,
            { street: c.street ?? '', postalCode: c.postalCode ?? '', city: c.city ?? '', phone: c.phone ?? '', latitude: c.latitude, longitude: c.longitude },
          ])
        )}
        employees={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))}
        vehicles={vehicles.map((v) => ({ value: v.id, label: v.name }))}
        categories={categories.map((c) => ({
          value: c.id,
          label: locale === 'en' ? c.nameEn : c.nameDe,
        }))}
        initial={{
          name: project.name,
          customerId: project.customerId,
          status: project.status,
          isSub: project.isSub,
          clientType: project.clientType ?? '',
          buildingType: project.buildingType ?? '',
          street: project.street ?? '',
          postalCode: project.postalCode ?? '',
          city: project.city ?? '',
          latitude: project.latitude,
          longitude: project.longitude,
          phone: project.phone ?? '',
          contact: project.contact ?? '',
          // Never ship the price to clients without financial access.
          price: showPrice && project.price != null ? String(Number(project.price)) : '',
          plannedStart: toDateInputValue(project.plannedStart),
          plannedEnd: toDateInputValue(project.plannedEnd),
          actualStart: toDateInputValue(project.actualStart),
          actualEnd: toDateInputValue(project.actualEnd),
          managerId: project.managerId ?? '',
          vehicleIds: project.vehicles.map((pv) => pv.vehicleId),
          description: project.description ?? '',
          internalNotes: project.internalNotes ?? '',
          categoryIds: project.workCategories.map((wc) => wc.workCategoryId),
          teamIds: project.team.map((m) => m.employeeId),
        }}
      />
    </div>
  )
}
