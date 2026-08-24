import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/back-link'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { ChecklistForm } from '../checklist-form'
import { deleteChecklist, updateChecklist } from '../actions'

export default async function EditChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireManagement()
  const { id } = await params
  const t = await getTranslations('checklists')

  const list = await db.checklistTemplate.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!list) notFound()

  return (
    <div className="space-y-4">
      <div>
        <BackLink href="/projects/checklists" label={t('templatesTitle')} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{list.name}</h1>
      </div>
      <ChecklistForm
        action={updateChecklist.bind(null, list.id)}
        deleteAction={deleteChecklist.bind(null, list.id)}
        initial={{
          name: list.name,
          description: list.description ?? '',
          active: list.active,
          items: list.items.map((i) => i.text),
        }}
      />
    </div>
  )
}
