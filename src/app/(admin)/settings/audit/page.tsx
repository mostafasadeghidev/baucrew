import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { BackLink } from '@/components/back-link'
import { DeleteButton } from '@/components/delete-button'
import { LiveSearchInput, LiveSelect } from '@/components/live-search'
import { Pagination } from '@/components/pagination'
import { parsePage } from '@/lib/pagination'
import type { Prisma } from '@/generated/prisma/client'
import { clearAuditLog } from './actions'

const PAGE = 50
const STATUS_KEYS = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED']
const ROLE_KEYS = ['ADMIN', 'MANAGER', 'EMPLOYEE']
const ITEM_KEYS = ['REQUIRED', 'COLLECTED', 'MISSING']
const VEHICLE_KEYS = ['AVAILABLE', 'MAINTENANCE', 'OUT_OF_SERVICE']

/** Where a log entry's entity lives in the app (for the "open" link). */
function entityHref(entity: string, id: string): string | null {
  switch (entity) {
    case 'Project':
      return `/projects/${id}`
    case 'Customer':
      return `/customers/${id}`
    case 'Employee':
      return `/employees/${id}`
    case 'Vehicle':
      return `/vehicles/${id}`
    case 'CatalogItem':
      return `/warehouse/${id}/edit`
    case 'ProjectTemplate':
      return `/projects/templates/${id}`
    case 'User':
      return `/settings/users/${id}`
    default:
      return null
  }
}

/**
 * Audit log for the owner: plain-language action and area names, status/role
 * values translated, technical keys only as tooltip. Administrators only.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string; page?: string }>
}) {
  await requireAdmin()
  const { q, entity, page: pageParam } = await searchParams
  const [t, tNav, tStatus, tRoles, tItem, tVehicle, locale] = await Promise.all([
    getTranslations('audit'),
    getTranslations('nav'),
    getTranslations('status'),
    getTranslations('roles'),
    getTranslations('itemStatus'),
    getTranslations('vehicleStatus'),
    getLocale(),
  ])
  const query = q?.trim() ?? ''
  const page = parsePage(pageParam)

  const where: Prisma.AuditLogWhereInput = {
    ...(entity ? { entity } : {}),
    ...(query
      ? {
          OR: [
            { action: { contains: query, mode: 'insensitive' } },
            { entityId: { contains: query, mode: 'insensitive' } },
            { oldValue: { contains: query, mode: 'insensitive' } },
            { newValue: { contains: query, mode: 'insensitive' } },
            { user: { username: { contains: query, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
  const [rows, total, entities] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ['entity'], _count: { _all: true }, orderBy: { entity: 'asc' } }),
  ])
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  /** "project.status.auto" → translated label; unknown keys fall back to the raw key. */
  function actionLabel(action: string): string {
    const key = `actions.${action.replace(/\./g, '_')}`
    return t.has(key) ? t(key) : action
  }
  function entityLabel(name: string): string {
    const key = `entities.${name}`
    return t.has(key) ? t(key) : name
  }
  function fieldLabel(field: string): string {
    const key = `fields.${field}`
    return t.has(key) ? t(key) : field
  }
  /** Status / role enum values are shown in the user's language. */
  function valueLabel(v: string, field: string | null): string {
    // Values may be a bare enum key or "KEY (extra info)" — translate the key part.
    const m = /^([A-Z_]+)(\s.*)?$/.exec(v)
    if (!m) return v
    const [, key, rest = ''] = m
    let label: string | null = null
    if (STATUS_KEYS.includes(key)) label = tStatus(key)
    else if (field === 'role' && ROLE_KEYS.includes(key)) label = tRoles(key)
    else if (ITEM_KEYS.includes(key)) label = tItem(key)
    else if (VEHICLE_KEYS.includes(key) && tVehicle.has(key)) label = tVehicle(key)
    return label ? label + rest : v
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <BackLink href="/settings?tab=data" label={tNav('settings')} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-sm text-muted">{t('hint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DeleteButton
              action={clearAuditLog.bind(null, 90)}
              label={t('clearOld', { days: 90 })}
              confirmMessage={t('clearOldConfirm', { days: 90 })}
            />
            <DeleteButton action={clearAuditLog.bind(null, null)} label={t('clearAll')} confirmMessage={t('clearAllConfirm')} />
          </div>
        </div>
      </div>

      <div className="flex max-w-2xl flex-wrap items-center gap-2">
        <LiveSearchInput placeholder={t('searchPlaceholder')} />
        <LiveSelect
          param="entity"
          allLabel={t('allEntities')}
          options={entities.map((e) => ({ value: e.entity, label: `${entityLabel(e.entity)} (${e._count._all})` }))}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">{t('time')}</th>
              <th className="px-3 py-2 font-medium">{t('user')}</th>
              <th className="px-3 py-2 font-medium">{t('action')}</th>
              <th className="px-3 py-2 font-medium">{t('entity')}</th>
              <th className="px-3 py-2 font-medium">{t('change')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const href = entityHref(r.entity, r.entityId)
                return (
                  <tr key={r.id} className="align-top hover:bg-surface-hover">
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted">{fmt.format(r.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {r.user?.username ?? <span className="text-muted">{t('system')}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5" title={r.action}>
                      {actionLabel(r.action)}
                    </td>
                    <td className="px-3 py-1.5">
                      {href ? (
                        <Link href={href} className="text-accent hover:underline" title={t('open')}>
                          {entityLabel(r.entity)} ↗
                        </Link>
                      ) : (
                        entityLabel(r.entity)
                      )}
                      {r.field && <span className="ml-1 text-xs text-muted">· {fieldLabel(r.field)}</span>}
                    </td>
                    <td className="max-w-[420px] px-3 py-1.5">
                      {r.oldValue && <span className="text-muted line-through">{valueLabel(r.oldValue, r.field)}</span>}
                      {r.oldValue && r.newValue && <span className="mx-1 text-muted">→</span>}
                      {r.newValue && <span>{valueLabel(r.newValue, r.field)}</span>}
                      {!r.oldValue && !r.newValue && <span className="text-muted">—</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{t('total', { count: total })}</p>
      <Pagination page={page} total={total} pageSize={PAGE} />
    </div>
  )
}
