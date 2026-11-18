import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { btn } from '@/components/ui/button'
import { ProjectItemsEditor, type ProjectItemRow } from './project-items'
import { ProjectDevicesEditor, type ProjectDeviceRow } from './project-devices'
import { NeedsPasteButton } from './needs-paste'

export type NeedsKind = { value: string; label: string }
export type NeedsItem = ProjectItemRow & { kind: string }
export type NeedsCatalogOption = { value: string; label: string; kind: string }
export type NeedsHandout = { id: string; deviceId: string; name: string; inventoryNo: string | null; since: string }

/**
 * What the job needs, in the three parts the office thinks in: material,
 * tools (both from the app's own catalogue, kept under Lager) and machines
 * (the Wattro-synced devices, kept under Geräte). One block, used by the card
 * over the board and by the full project page alike. A company's own extra
 * kinds (Settings → item kinds) get a section each after the tools.
 */
export async function NeedsSections({
  projectId,
  kinds,
  items,
  catalog,
  devices,
  deviceOptions,
  handouts,
  office,
}: {
  projectId: string
  /** The kinds in the order they are shown (material first, then tools). */
  kinds: NeedsKind[]
  items: NeedsItem[]
  /** Active catalogue entries not on the project yet. */
  catalog: NeedsCatalogOption[]
  devices: ProjectDeviceRow[]
  deviceOptions: Array<{ value: string; label: string }>
  /** Machines handed out to this site right now. */
  handouts: NeedsHandout[]
  office: boolean
}) {
  const [t, tDevices] = await Promise.all([getTranslations('projectNeeds'), getTranslations('devices')])
  // An entry of a kind no longer in the list still shows, under its stored name.
  const shown = [...kinds, ...[...new Set(items.map((i) => i.kind))].filter((k) => !kinds.some((x) => x.value === k)).map((k) => ({ value: k, label: k }))]

  return (
    <>
      {shown.map((kind, index) => {
        const rows = items.filter((i) => i.kind === kind.value)
        return (
          // `#material`: the CRM's missing-material lists link straight to the first part.
          <section
            key={kind.value}
            id={index === 0 ? 'material' : `needs-${kind.value.toLowerCase()}`}
            className="scroll-mt-24 rounded-xl border border-border bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">
                {kind.label}
                {rows.length > 0 && <span className="ml-1.5 font-normal tabular-nums text-muted">{rows.length}</span>}
              </h2>
              <span className="flex flex-wrap items-center gap-2">
                <NeedsPasteButton projectId={projectId} defaultKind={kind.value} kinds={kinds} canCreate={office} />
                {office && (
                  <Link href={`/warehouse?kind=${encodeURIComponent(kind.value)}`} className={`${btn.outlineXs} px-2 text-muted`}>
                    {t('openWarehouse')} <span aria-hidden>→</span>
                  </Link>
                )}
              </span>
            </div>
            <ProjectItemsEditor
              projectId={projectId}
              items={rows}
              options={catalog.filter((c) => c.kind === kind.value).map(({ value, label }) => ({ value, label }))}
              canCreateItems={office}
              kinds={[kind]}
              placeholder={t('selectOfKind', { kind: kind.label })}
              emptyText={t('noneOfKind')}
            />
          </section>
        )
      })}

      {/* Machines — Wattro's devices, read here, handed out under Geräte */}
      <section id="machines" className="scroll-mt-24 rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">
            {t('machines')}
            {devices.length > 0 && <span className="ml-1.5 font-normal tabular-nums text-muted">{devices.length}</span>}
          </h2>
          {office && (
            <Link href="/devices" className={`${btn.outlineXs} px-2 text-muted`}>
              {tDevices('openDevices')} <span aria-hidden>→</span>
            </Link>
          )}
        </div>
        <ProjectDevicesEditor projectId={projectId} devices={devices} options={deviceOptions} canHandOut={office} />
        {handouts.length > 0 && (
          <div className="border-t border-border px-5 py-3">
            <h3 className="text-xs font-semibold text-muted">{tDevices('onProject')}</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {handouts.map((handout) => (
                <li key={handout.id} className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/devices/${handout.deviceId}`} className="font-medium text-accent hover:underline">
                    {handout.name}
                  </Link>
                  {handout.inventoryNo && <span className="text-xs tabular-nums text-muted">{handout.inventoryNo}</span>}
                  <span className="text-xs text-muted">{handout.since}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  )
}
