import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { DeleteButton } from '@/components/delete-button'
import { deleteItem, updateItem } from '../../actions'
import { ItemForm } from '../../item-form'

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [t, tc] = await Promise.all([getTranslations('warehouse'), getTranslations('common')])
  const item = await db.catalogItem.findUnique({ where: { id } })
  if (!item) notFound()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('editTitle')} — {item.name}
        </h1>
        <DeleteButton
          action={deleteItem.bind(null, item.id)}
          label={tc('delete')}
          confirmMessage={t('deleteConfirm')}
          errorLabels={{ cannotDeleteInUse: t('cannotDeleteInUse') }}
        />
      </div>
      <ItemForm
        action={updateItem.bind(null, item.id)}
        cancelHref="/warehouse"
        initial={{
          kind: item.kind,
          name: item.name,
          category: item.category ?? '',
          unit: item.unit ?? '',
          stockQuantity: item.stockQuantity != null ? String(Number(item.stockQuantity)) : '',
          minStock: item.minStock != null ? String(Number(item.minStock)) : '',
          location: item.location ?? '',
          active: item.active,
          notes: item.notes ?? '',
        }}
      />
    </div>
  )
}
