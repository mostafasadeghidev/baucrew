import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { parseFields, parseSigners } from '@/lib/forms'
import { btn } from '@/components/ui/button'
import { PageBar, PageHint, PagePanel, StickyHead } from '@/components/ui/page-panel'

/** The form templates: what a project's forms are made from. */
export default async function FormTemplatesPage() {
  await requireManagement()
  const [t, tc, tProjects] = await Promise.all([getTranslations('forms'), getTranslations('common'), getTranslations('projects')])

  const templates = await db.formTemplate.findMany({
    include: { _count: { select: { forms: true } } },
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar
          back={{ href: '/projects', label: tProjects('title') }}
          title={t('templatesTitle')}
          actions={
            <Link href="/projects/forms/new" className={btn.primary}>
              {t('templateAdd')}
            </Link>
          }
        />
      </StickyHead>
      <PageHint>{t('templatesHint')}</PageHint>

      <PagePanel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-56" />
              <col className="w-28" />
              <col className="w-24" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">{t('templateName')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('templateFields')}</th>
                <th className="px-4 py-3 font-medium">{t('templateSigners')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('templateUsed')}</th>
                <th className="px-4 py-3 font-medium">{tc('active')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    {t('templateNone')}
                  </td>
                </tr>
              ) : (
                templates.map((template) => (
                  <tr key={template.id} className="hover:bg-surface-hover">
                    <td className="break-words px-4 py-3">
                      <Link href={`/projects/forms/${template.id}`} className="font-medium text-accent hover:underline">
                        {template.name}
                      </Link>
                      {template.description && <p className="text-xs text-muted">{template.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {parseFields(template.fields).filter((f) => f.type !== 'heading').length}
                    </td>
                    <td className="truncate px-4 py-3 text-muted">{parseSigners(template.signers).join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{template._count.forms || '—'}</td>
                    <td className="px-4 py-3">{template.active ? tc('yes') : tc('no')}</td>
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
