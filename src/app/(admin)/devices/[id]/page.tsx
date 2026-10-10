import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { PlayCircle } from 'lucide-react'
import { db } from '@/lib/db'
import { canViewFinancials, requireManagement } from '@/lib/authz'
import { daysOut, deviceState } from '@/lib/devices'
import { readWattroDetails } from '@/lib/wattro/details'
import { WATTRO_SYSTEM } from '@/lib/wattro/assets'
import { WattroDevice } from '../wattro-device'
import { DeviceForm } from '../device-form'
import { HandoutPanel } from '../handout-panel'
import { deleteDevice, updateDevice } from '../actions'
import { PageBar, StickyHead } from '@/components/ui/page-panel'

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireManagement()
  const { id } = await params
  const [t, locale] = await Promise.all([getTranslations('devices'), getLocale()])
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'

  const [device, projects, employees, usedCategories] = await Promise.all([
    db.device.findUnique({
      where: { id },
      include: {
        assignments: {
          orderBy: { takenAt: 'desc' },
          take: 20,
          include: {
            project: { select: { id: true, number: true, name: true } },
            employee: { select: { id: true, firstName: true, lastName: true } },
            createdBy: { select: { username: true } },
          },
        },
      },
    }),
    db.project.findMany({
      where: { status: { in: ['PLANNED', 'IN_PROGRESS', 'APPROVED'] } },
      select: { id: true, number: true, name: true },
      orderBy: { number: 'desc' },
      take: 100,
    }),
    db.employee.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    }),
    db.device.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    }),
  ])
  if (!device) notFound()

  // A machine Wattro keeps shows what Wattro says and nothing else: its
  // fields are edited, and the machine handed out, in Wattro. Whose it is
  // is read the way the server reads it when a form arrives — off the
  // system stamp, not off whether the details could be read — or a row
  // whose details are still missing would show the form, and a form whose
  // edits the server drops.
  if (device.externalSystem === WATTRO_SYSTEM) {
    const wattro = readWattroDetails(device.externalData)
    return (
      <div className="space-y-4">
        <StickyHead>
          <PageBar back={{ href: '/devices', label: t('title') }} title={device.name} />
        </StickyHead>
        {wattro ? (
          <WattroDevice
            details={wattro}
            owned={{ inventoryNo: device.inventoryNo, storageLocation: device.storageLocation, active: device.active }}
            locale={locale}
            showPrice={canViewFinancials(user)}
          />
        ) : (
          <p className="rounded-lg border border-border bg-subtle px-4 py-3 text-sm text-muted">{t('wattroNoDetails')}</p>
        )}
      </div>
    )
  }

  const state = deviceState(device.assignments)
  const open = device.assignments.find((a) => a.returnedAt === null)
  const dateFmt = new Intl.DateTimeFormat(intl, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar
          back={{ href: '/devices', label: t('title') }}
          title={device.name}
          meta={
            device.videoUrl && (
              <a
                href={device.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm text-accent hover:underline"
              >
                <PlayCircle className="h-4 w-4" aria-hidden />
                {t('video')}
              </a>
            )
          }
        />
      </StickyHead>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <DeviceForm
          action={updateDevice.bind(null, device.id)}
          deleteAction={deleteDevice.bind(null, device.id)}
          categories={usedCategories.map((u) => u.category!).filter(Boolean)}
          initial={{
            name: device.name,
            inventoryNo: device.inventoryNo ?? '',
            category: device.category ?? '',
            storageLocation: device.storageLocation ?? '',
            videoUrl: device.videoUrl ?? '',
            notes: device.notes ?? '',
            active: device.active,
          }}
        />

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">{t('whereNow')}</h2>
            <p className="mt-2 text-sm">
              {state.status === 'free' ? (
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  ● {t('freeInStore', { place: device.storageLocation ?? t('store') })}
                </span>
              ) : (
                <span className="text-red-700 dark:text-red-400">
                  ●{' '}
                  {state.status === 'onSite' ? (
                    <Link href={`/projects/${state.projectId}`} className="hover:underline">
                      {state.label}
                    </Link>
                  ) : state.status === 'withEmployee' ? (
                    <Link href={`/employees/${state.employeeId}`} className="hover:underline">
                      {state.label}
                    </Link>
                  ) : (
                    t('out')
                  )}
                </span>
              )}
            </p>
            {open && (
              <p className="mt-1 text-xs text-muted">
                {t('sinceDays', { days: daysOut(open.takenAt, new Date()) })}
                {open.note && ` · ${open.note}`}
              </p>
            )}

            <div className="mt-4">
              <HandoutPanel
                deviceId={device.id}
                busy={state.status !== 'free'}
                projects={projects.map((p) => ({ value: p.id, label: `${p.number} — ${p.name}` }))}
                employees={employees.map((e) => ({
                  value: e.id,
                  label: `${e.firstName} ${e.lastName}`.trim(),
                }))}
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">{t('history')}</h2>
            {device.assignments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">{t('noHistory')}</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {device.assignments.map((a) => (
                  <li key={a.id} className="px-5 py-2.5">
                    <p className="truncate">
                      {a.project ? (
                        <Link href={`/projects/${a.project.id}`} className="text-accent hover:underline">
                          {a.project.number} — {a.project.name}
                        </Link>
                      ) : a.employee ? (
                        <Link href={`/employees/${a.employee.id}`} className="text-accent hover:underline">
                          {`${a.employee.firstName} ${a.employee.lastName}`.trim()}
                        </Link>
                      ) : (
                        t('out')
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {dateFmt.format(a.takenAt)} –{' '}
                      {a.returnedAt ? dateFmt.format(a.returnedAt) : t('stillOut')}
                      {a.createdBy && ` · ${a.createdBy.username}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
