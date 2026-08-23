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
import { getOptionLists } from '@/lib/option-lists-db'
import { optionLabel } from '@/lib/option-lists'

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
  searchParams,
}: {
  params: Promise<{ id: string }>
  /** `entry` = work order for one assignment (its team, vehicles and date). */
  searchParams: Promise<{ entry?: string }>
}) {
  // The sheet contains no financial data, so employees may open it too —
  // but only for operationally relevant projects (see guard below).
  const user = await requireUser()
  const { id } = await params
  const { entry: entryId } = await searchParams
  const [t, tc, locale] = await Promise.all([
    getTranslations('sheet'),
    getTranslations('common'),
    getLocale(),
  ])

  const [project, allCategories] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        customer: true,
        manager: true,
        vehicles: { include: { vehicle: true } },
        checklists: {
          orderBy: { createdAt: 'asc' },
          include: {
            items: {
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              include: { checkedBy: { select: { firstName: true, lastName: true } } },
            },
          },
        },
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

  // Opened from an assignment: its own team, vehicles and date win over the
  // project defaults — that is what the crew of that day actually needs.
  const entry = entryId
    ? await db.scheduleEntry.findFirst({
        where: { id: entryId, projectId: project.id },
        include: {
          employees: { include: { employee: true } },
          vehicles: { include: { vehicle: true } },
        },
      })
    : null
  const sheetTeam = entry && entry.employees.length > 0
    ? entry.employees.map((e) => `${e.employee.firstName} ${e.employee.lastName}`.trim())
    : project.team.map((m) => `${m.employee.firstName} ${m.employee.lastName}`.trim())
  const sheetVehicles = entry && entry.vehicles.length > 0
    ? entry.vehicles.map((v) => v.vehicle.name)
    : project.vehicles.map((pv) => pv.vehicle.name)
  const sheetDate = entry ? entry.date : project.createdAt

  // Personal employee accounts only see work orders of their own projects or
  // of projects that are scheduled around now. The shared warehouse account
  // (an employee login without a linked employee — `lager`) is the kiosk
  // account: it prepares the material for everyone and may open every work
  // order (the sheet never contains prices).
  if (user.role === 'EMPLOYEE' && user.employee) {
    const now = new Date()
    const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 14))
    const to = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 30))
    const inTeam = project.team.some((m) => m.employeeId === user.employee!.id)
    if (!inTeam) {
      const scheduled = await db.scheduleEntry.count({
        where: { projectId: project.id, date: { gte: from, lte: to }, cancelledAt: null },
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
  const materials = project.items.filter((i) => i.catalogItem.kind !== 'TOOL')

  const [branding, lists] = await Promise.all([getBranding(), getOptionLists()])

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
      {/* Stays reachable while scrolling through the sheet */}
      <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 print:hidden">
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
                  <span className="tabular-nums">{formatDate(sheetDate, locale)}</span>
                </p>
                <p>
                  <span className="font-semibold">{t('vehicle')}: </span>
                  {sheetVehicles.join(', ')}
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
              {lists.clientTypes.map((e) => (
                <Checkbox
                  key={e.value}
                  checked={project.clientType === e.value}
                  label={optionLabel(lists.clientTypes, e.value, locale)}
                />
              ))}
              <span className="mx-2 text-black/40">|</span>
              {lists.buildingTypes.map((e) => (
                <Checkbox
                  key={e.value}
                  checked={project.buildingType === e.value}
                  label={optionLabel(lists.buildingTypes, e.value, locale)}
                />
              ))}
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
          <FieldRow label={t('team')} value={sheetTeam.join(', ')} />
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

        {/* Checklists: tick on site, the printed sheet carries them too */}
        {project.checklists.map((list) => (
          <div key={list.id} className="mt-4 border border-black">
            <p className="border-b border-black px-2 py-1.5 font-semibold">{list.name}</p>
            <ul className="px-2 py-1.5 leading-7">
              {list.items.map((item) => (
                <li key={item.id} className="flex items-start gap-1.5">
                  <span
                    aria-hidden
                    className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center border-2 border-black text-[10px] font-bold leading-none"
                  >
                    {item.ok === true ? '\u2715' : item.ok === false ? '!' : ' '}
                  </span>
                  <span className="min-w-0">
                    {item.text}
                    {item.note && <span className="italic"> — {item.note}</span>}
                    {item.checkedBy && (
                      <span className="text-[11px]">
                        {' '}
                        ({item.checkedBy.firstName} {item.checkedBy.lastName}
                        {item.checkedAt ? `, ${formatDate(item.checkedAt, locale)}` : ''})
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {list.items.length === 0 && <li className="text-black/60">—</li>}
            </ul>
          </div>
        ))}

        <div className="mt-4 border border-black">
          <p className="border-b border-black px-2 py-1.5 font-semibold">{t('notes')}</p>
          <p className="min-h-24 whitespace-pre-wrap px-2 py-1.5">{project.description ?? ''}</p>
        </div>
      </div>
    </div>
  )
}
