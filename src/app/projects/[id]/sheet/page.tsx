import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'
import { getBranding } from '@/lib/branding'
import { formatDate } from '@/lib/format'
import { PrintButton } from '@/components/print-button'
import { BackButton } from '@/components/back-button'

function Checkbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className="mr-4 inline-flex items-start gap-1.5">
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center border-2 border-black text-xs font-bold leading-none"
      >
        {checked ? '✕' : ' '}
      </span>
      {/* Long labels wrap onto the next line inside their own column */}
      <span className="min-w-0">{label}</span>
    </span>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex border-b border-black">
      <div className="w-56 shrink-0 border-r border-black px-2 py-1.5 font-semibold">{label}</div>
      <div className="min-h-8 flex-1 px-2 py-1.5">{value || ' '}</div>
    </div>
  )
}

export default async function ProjectSheetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // The sheet contains no financial data, so employees may open it too —
  // but only for operationally relevant projects (see guard below).
  const user = await requireUser()
  const { id } = await params
  const [t, tc, tClient, tBuilding, locale] = await Promise.all([
    getTranslations('sheet'),
    getTranslations('common'),
    getTranslations('clientType'),
    getTranslations('buildingType'),
    getLocale(),
  ])

  const [project, allCategories] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        customer: true,
        manager: true,
        vehicles: { include: { vehicle: true } },
        workCategories: { select: { workCategoryId: true } },
        team: { include: { employee: true }, orderBy: { createdAt: 'asc' } },
        items: {
          include: { catalogItem: { select: { name: true, unit: true, kind: true } } },
          orderBy: { catalogItem: { name: 'asc' } },
        },
      },
    }),
    db.workCategory.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ])
  if (!project) notFound()

  // Employees (incl. the shared warehouse account) may only open sheets of
  // projects that are scheduled around now or that they are assigned to.
  if (user.role === 'EMPLOYEE') {
    const now = new Date()
    const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 1))
    const to = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 7))
    const inTeam = user.employee
      ? project.team.some((m) => m.employeeId === user.employee!.id)
      : false
    if (!inTeam) {
      const scheduled = await db.scheduleEntry.count({
        where: { projectId: project.id, date: { gte: from, lte: to } },
      })
      if (scheduled === 0) redirect('/my')
    }
  }

  const assignedCategoryIds = new Set(project.workCategories.map((wc) => wc.workCategoryId))
  const categoryLabel = (c: { nameDe: string; nameEn: string }) =>
    locale === 'en' ? c.nameEn : c.nameDe
  const address = [
    project.street,
    [project.postalCode, project.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')
  const tools = project.items.filter((i) => i.catalogItem.kind === 'TOOL')
  const materials = project.items.filter((i) => i.catalogItem.kind === 'MATERIAL')

  const branding = await getBranding()

  // QR code linking back to this project (scannable from the printed sheet)
  const headerStore = await headers()
  const host = headerStore.get('host') ?? 'localhost'
  const proto = headerStore.get('x-forwarded-proto') ?? 'http'
  // The QR targets the sheet itself — readable for every role on any device.
  const qrDataUrl = await QRCode.toDataURL(`${proto}://${host}/projects/${project.id}/sheet`, {
    margin: 0,
    width: 192,
  })

  const itemLine = (item: (typeof project.items)[number]) =>
    `${item.catalogItem.name}${
      item.quantity != null
        ? ` — ${Number(item.quantity)}${item.catalogItem.unit ? ` ${item.catalogItem.unit}` : ''}`
        : ''
    }`

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6 print:p-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <BackButton label={tc('back')} />
        <PrintButton label={t('print')} />
      </div>

      {/* A4 sheet — always black on white */}
      <div className="rounded-lg border border-border bg-white p-8 text-sm text-black shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* Header exactly like the original Arbeitsauftrag: company logo,
            "Auftrag vom" and "Fahrzeug" top right */}
        <div className="mb-4 border-b-2 border-black pb-3">
          <div className="flex items-start justify-between gap-4">
            {branding.hasLogo ? (
              <Image
                src="/logo"
                unoptimized
                alt={branding.companyName}
                width={220}
                height={56}
                priority
                className="h-14 w-auto"
              />
            ) : (
              <p className="text-2xl font-bold tracking-tight">{branding.companyName}</p>
            )}
            <div className="flex items-start gap-4">
              <div className="text-right text-sm">
                <p>
                  <span className="font-semibold">{t('orderFrom')}: </span>
                  <span className="tabular-nums">{formatDate(project.createdAt, locale)}</span>
                </p>
                <p>
                  <span className="font-semibold">{t('vehicle')}: </span>
                  {project.vehicles.map((pv) => pv.vehicle.name).join(', ')}
                </p>
              </div>
              <Image
                src={qrDataUrl}
                alt={project.number}
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16"
              />
            </div>
          </div>
          <div className="mt-3">
            <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="text-xs text-black/60">
              {project.number} · {project.name}
            </p>
          </div>
        </div>

        <div className="border border-b-0 border-black">
          <FieldRow label={t('client')} value={project.customer.name} />
          <FieldRow label={t('address')} value={address} />
          <FieldRow label={t('phone')} value={project.phone ?? project.customer.phone ?? ''} />

          <div className="flex border-b border-black">
            <div className="w-56 shrink-0 border-r border-black px-2 py-1.5 font-semibold">
              {t('siteSetup')}
            </div>
            <div className="flex-1 px-2 py-1.5">
              <Checkbox checked={project.clientType === 'PRIVAT'} label={tClient('PRIVAT')} />
              <Checkbox checked={project.clientType === 'GEWERBLICH'} label={tClient('GEWERBLICH')} />
              <span className="mx-2 text-black/40">|</span>
              <Checkbox checked={project.buildingType === 'NEUBAU'} label={tBuilding('NEUBAU')} />
              <Checkbox
                checked={project.buildingType === 'ALTBAU_SANIERUNG'}
                label={tBuilding('ALTBAU_SANIERUNG')}
              />
            </div>
          </div>

          <div className="flex border-b border-black">
            <div className="w-56 shrink-0 border-r border-black px-2 py-1.5 font-semibold">
              {t('workType')}
            </div>
            {/* Fixed 3-column grid so every row lines up with the one above */}
            <div className="grid flex-1 grid-cols-3 gap-y-1.5 px-2 py-1.5">
              {allCategories.map((c) => (
                <Checkbox key={c.id} checked={assignedCategoryIds.has(c.id)} label={categoryLabel(c)} />
              ))}
            </div>
          </div>

          <FieldRow
            label={t('manager')}
            value={project.manager ? `${project.manager.firstName} ${project.manager.lastName}`.trim() : ''}
          />
          <FieldRow
            label={t('team')}
            value={project.team
              .map((m) => `${m.employee.firstName} ${m.employee.lastName}`.trim())
              .join(', ')}
          />
          <FieldRow label={t('start')} value={formatDate(project.plannedStart, locale)} />
          <FieldRow label={t('plannedEnd')} value={formatDate(project.plannedEnd, locale)} />
        </div>

        {/* Single combined section like on the original form */}
        <div className="mt-4 border border-black">
          <p className="border-b border-black px-2 py-1.5 font-semibold">
            {t('tools')} / {t('materials')}
          </p>
          <div className="grid min-h-40 grid-cols-2 gap-x-4 px-2 py-1.5">
            <ul className="leading-7">
              {tools.map((item) => (
                <li key={item.id} className="flex items-center gap-1.5">
                  <span className="inline-block h-4 w-4 shrink-0 border-2 border-black" aria-hidden />
                  {itemLine(item)}
                </li>
              ))}
            </ul>
            <ul className="leading-7">
              {materials.map((item) => (
                <li key={item.id} className="flex items-center gap-1.5">
                  <span className="inline-block h-4 w-4 shrink-0 border-2 border-black" aria-hidden />
                  {itemLine(item)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 border border-black">
          <p className="border-b border-black px-2 py-1.5 font-semibold">{t('notes')}</p>
          <p className="min-h-24 whitespace-pre-wrap px-2 py-1.5">{project.description ?? ''}</p>
        </div>
      </div>
    </div>
  )
}
