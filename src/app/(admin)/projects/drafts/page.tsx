import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ExternalLink } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { DeleteButton } from '@/components/delete-button'
import { db } from '@/lib/db'
import { canViewFinancials, requireManagement } from '@/lib/authz'
import { formatCurrency } from '@/lib/format'
import { btn } from '@/components/ui/button'
import { dismissDraft } from './actions'

/** The inbox: everything that arrived from outside, waiting to become a project. */
export default async function DraftsPage() {
  const user = await requireManagement()
  const [t, tProjects, locale] = await Promise.all([
    getTranslations('drafts'),
    getTranslations('projects'),
    getLocale(),
  ])
  const showMoney = canViewFinancials(user)

  const drafts = await db.projectDraft.findMany({
    where: { status: 'open' },
    orderBy: { createdAt: 'desc' },
  })
  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <BackLink href="/projects" label={tProjects('title')} />
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('hint')}</p>
        </div>
        <Link href="/projects/import" className={btn.outline}>
          {t('toImport')}
        </Link>
      </div>

      {drafts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {t('none')}
        </p>
      ) : (
        <ul className="space-y-3">
          {drafts.map((draft) => (
            <li key={draft.id} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{draft.name}</span>
                    <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">
                      {t(`source_${draft.source}` as 'source_excel')}
                    </span>
                    {draft.externalUrl && (
                      <a
                        href={draft.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        {t('sourceLink')}
                      </a>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {[
                      draft.customerName,
                      [draft.street, [draft.postalCode, draft.city].filter(Boolean).join(' ')]
                        .filter(Boolean)
                        .join(', ') || null,
                      draft.plannedStart
                        ? `${t('plannedStart')}: ${dateFmt.format(draft.plannedStart)}`
                        : null,
                      showMoney && draft.price != null
                        ? formatCurrency(Number(draft.price), locale)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                  {draft.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{draft.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link href={`/projects/new?draft=${draft.id}`} className={btn.primarySm}>
                    {t('takeOver')}
                  </Link>
                  <DeleteButton
                    action={dismissDraft.bind(null, draft.id)}
                    label={t('dismiss')}
                    confirmMessage={`${draft.name} — ${t('dismiss')}?`}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
