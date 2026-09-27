import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { DeleteButton } from '@/components/delete-button'
import { deleteTemplate } from './templates/actions'
import { TemplateEditor } from './templates/[id]/template-editor'
import { SheetClose } from './card-sheet'
import { TEMPLATE_TONE, TemplateBadge, TemplateCardIcon } from './template-badge'

/**
 * A template opened over the board, the way Trello opens a template card: in
 * the card's own window, marked as a template, with the banner Trello puts
 * across it. "Vorlagen bearbeiten" and "Eine neue Vorlage erstellen" in the
 * card templates lead here (`?template=<id>`); closing it, or deleting the
 * template, leaves the board as it was.
 */
export async function TemplateSheet({ id, closeTo }: { id: string; closeTo: string }) {
  const [t, tt, tc] = await Promise.all([getTranslations('projects'), getTranslations('templates'), getTranslations('common')])
  const template = await db.projectTemplate.findUnique({ where: { id }, select: { id: true } })
  if (!template) {
    return (
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="px-2 py-6 text-sm text-muted">{t('templateMissing')}</p>
        <SheetClose />
      </div>
    )
  }
  return (
    <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      <div className="flex h-14 items-center justify-between gap-3 border-b border-border px-4">
        <TemplateBadge label={t('templateBadge')} large />
        <div className="flex items-center gap-2">
          <DeleteButton action={deleteTemplate.bind(null, template.id, closeTo)} label={tc('delete')} confirmMessage={tt('deleteConfirm')} />
          <SheetClose round />
        </div>
      </div>
      <div className="space-y-5 px-4 pb-8 pt-5 sm:px-6">
        <p className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${TEMPLATE_TONE}`}>
          <TemplateCardIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {t('templateSheetBanner')}
        </p>
        <TemplateEditor id={template.id} cancelHref={closeTo} />
      </div>
    </div>
  )
}
