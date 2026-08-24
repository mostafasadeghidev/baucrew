import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { btn } from '@/components/ui/button'

export default async function ChecklistsPage() {
  await requireManagement()
  const [t, tc, tProjects] = await Promise.all([
    getTranslations('checklists'),
    getTranslations('common'),
    getTranslations('projects'),
  ])

  const checklists = await db.checklistTemplate.findMany({
    include: { _count: { select: { items: true, templates: true } } },
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BackLink href="/projects" label={tProjects('title')} />
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('templatesTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('templatesHint')}</p>
        </div>
        <Link href="/projects/checklists/new" className={btn.primary}>
          {t('templateAdd')}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">{t('templateName')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('templateItems')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('usedInTemplates')}</th>
              <th className="px-4 py-3 font-medium">{tc('active')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {checklists.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  {t('templateNone')}
                </td>
              </tr>
            ) : (
              checklists.map((list) => (
                <tr key={list.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/checklists/${list.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {list.name}
                    </Link>
                    {list.description && (
                      <p className="text-xs text-muted">{list.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {list._count.items}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {list._count.templates || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {list.active ? (
                      <span className="text-emerald-700 dark:text-emerald-400">✓</span>
                    ) : (
                      <span className="text-muted">{tc('inactive')}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
