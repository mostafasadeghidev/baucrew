import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { StatusBadge } from '@/components/status-badge'
import { DeleteButton } from '@/components/delete-button'
import { formatDate } from '@/lib/format'
import { deleteCustomer } from '../actions'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [t, tc, locale] = await Promise.all([
    getTranslations('customers'),
    getTranslations('common'),
    getLocale(),
  ])

  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      projects: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          name: true,
          status: true,
          city: true,
          plannedStart: true,
        },
      },
    },
  })
  if (!customer) notFound()

  const rows: Array<[string, string | null]> = [
    [t('company'), customer.company],
    [t('contactPerson'), customer.contactPerson],
    [t('phone'), customer.phone],
    [t('email'), customer.email],
    [t('street'), customer.street],
    [t('postalCode'), customer.postalCode],
    [t('city'), customer.city],
    [t('country'), customer.country],
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/customers" className="text-sm text-muted hover:text-foreground">
            ← {t('title')}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{customer.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/customers/${customer.id}/edit`}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
          >
            {tc('edit')}
          </Link>
          <DeleteButton
            action={deleteCustomer.bind(null, customer.id)}
            label={tc('delete')}
            confirmMessage={t('deleteConfirm')}
            errorLabels={{ cannotDeleteHasProjects: t('cannotDeleteHasProjects') }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold">{t('contactData')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="w-40 shrink-0 text-muted">{label}</dt>
                <dd>{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {customer.notes && (
            <>
              <h3 className="mt-4 text-sm font-semibold">{t('notes')}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{customer.notes}</p>
            </>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">
            {t('projectsTitle')}
          </h2>
          {customer.projects.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">{t('noProjects')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {customer.projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/projects/${p.id}`} className="font-medium text-accent hover:underline">
                      {p.number} — {p.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {[p.city, formatDate(p.plannedStart, locale)].filter((v) => v && v !== '—').join(' · ')}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
