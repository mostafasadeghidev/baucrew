import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { btn } from '@/components/ui/button'
import { PageBar, PagePanel, StickyHead } from '@/components/ui/page-panel'

export default async function TemplatesPage() {
  await requireManagement()
  const [t, tc, tProjects, locale] = await Promise.all([
    getTranslations('templates'),
    getTranslations('common'),
    getTranslations('projects'),
    getLocale(),
  ])

  const templates = await db.projectTemplate.findMany({
    include: {
      workCategory: true,
      _count: { select: { items: true } },
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  })

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar
          back={{ href: '/projects', label: tProjects('title') }}
          title={t('title')}
          actions={
            <Link
              href="/projects/templates/new"
              className={btn.primary}
            >
              {t('newTemplate')}
            </Link>
          }
        />
      </StickyHead>

      <PagePanel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-48" />
              <col className="w-24" />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">{t('name')}</th>
                <th className="px-4 py-3 font-medium">{t('category')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('itemCount')}</th>
                <th className="px-4 py-3 font-medium">{tc('active')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    {t('noResults')}
                  </td>
                </tr>
              ) : (
                templates.map((template) => (
                  <tr key={template.id} className="hover:bg-surface-hover">
                    <td className="break-words px-4 py-3">
                      <Link
                        href={`/projects/templates/${template.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {template.name}
                      </Link>
                    </td>
                    <td className="break-words px-4 py-3 text-muted">
                      {template.workCategory
                        ? locale === 'en'
                          ? template.workCategory.nameEn
                          : template.workCategory.nameDe
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{template._count.items}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          template.active
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {template.active ? tc('active') : tc('inactive')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>
    </div>
  )
}
