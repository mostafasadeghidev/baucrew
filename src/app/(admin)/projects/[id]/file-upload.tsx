'use client'

import { useTranslations } from 'next-intl'
import type { UploadFailure } from './upload-files'

/**
 * What went wrong with an upload, in one line: the file's own reason, or how
 * many failed — for the attach window and for files dropped on the card.
 */
export function useUploadMessage() {
  const t = useTranslations('files')
  return (failed: UploadFailure[]) =>
    failed.length === 1
      ? `${failed[0].name}: ${t(failed[0].error)}`
      : t('uploadSomeFailed', { count: failed.length })
}
