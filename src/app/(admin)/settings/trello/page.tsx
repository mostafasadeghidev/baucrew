import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/authz'
import { db } from '@/lib/db'
import { Card } from '@/components/ui/card'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'
import { btn } from '@/components/ui/button'
import { configuredTrelloInterval, discoverTrelloBoards, getLastTrelloSync } from '@/lib/trello/auto-sync'
import { isTrelloConfigured } from '@/lib/trello/pull'
import { pendingTrelloFiles } from '@/lib/trello-files'
import { saveTrelloSyncBoard } from './actions'
import { TrelloSyncButton } from './sync-button'

/**
 * Settings → Trello: the boards of the account the server's key belongs to,
 * each with one switch. A board switched on is pulled from Trello and brought
 * into the projects by the server itself, every hour and on the button —
 * lists as columns, statuses by the lists' names, customers off the cards.
 * Nothing to upload, nothing to map. The file wizard stays for a one-off file.
 */
export default async function TrelloSettingsPage() {
  await requireAdmin()
  const [t, tNav, locale] = await Promise.all([getTranslations('trelloSync'), getTranslations('nav'), getLocale()])
  const configured = isTrelloConfigured()
  let rows: Awaited<ReturnType<typeof discoverTrelloBoards>> = []
  let discoverError: string | null = null
  if (configured) {
    try {
      rows = await discoverTrelloBoards()
    } catch (e) {
      discoverError = e instanceof Error ? e.message : 'error'
      rows = await db.trelloSyncBoard.findMany({ orderBy: [{ closed: 'asc' }, { sortOrder: 'asc' }] })
    }
  }
  const [lastSync, pending] = await Promise.all([getLastTrelloSync(), pendingTrelloFiles()])
  const interval = configuredTrelloInterval()
  const time = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'short', timeStyle: 'short' })
  const on = rows.filter((r) => r.enabled).length

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar back={{ href: '/settings?tab=data', label: tNav('settings') }} title={t('title')} />
      </StickyHead>
      <PageHint>{t('intro')}</PageHint>

      {!configured ? (
        <Card title={t('notConfiguredTitle')} description={t('notConfigured')}>
          <Link href="/settings/import-trello" className={btn.outline}>
            {t('wizardLink')}
          </Link>
        </Card>
      ) : (
        <>
          <Card title={t('stateTitle')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 text-sm text-muted">
                <p>{lastSync ? t('lastRun', { time: time.format(lastSync) }) : t('neverRun')}</p>
                <p>{interval > 0 ? t('auto', { minutes: interval, boards: on }) : t('autoOff', { boards: on })}</p>
                {pending > 0 && <p>{t('filesPending', { count: pending })}</p>}
                {discoverError && <p className="text-red-700 dark:text-red-400">{t('discoverFailed')}</p>}
              </div>
              <TrelloSyncButton />
            </div>
          </Card>

          <Card title={t('boardsTitle')} description={t('boardsHint')}>
            {rows.length === 0 ? (
              <p className="text-sm text-muted">{t('noBoards')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <li key={row.id} className="py-3">
                    <form action={saveTrelloSyncBoard} className="flex flex-wrap items-start gap-x-6 gap-y-2">
                      <input type="hidden" name="id" value={row.id} />
                      <label className="flex min-w-[16rem] flex-1 cursor-pointer items-start gap-2">
                        <input type="checkbox" name="enabled" defaultChecked={row.enabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                        <span>
                          <span className={`block text-sm ${row.closed ? 'text-muted line-through' : 'text-foreground'}`}>{row.name}</span>
                          <span className="block text-xs text-muted">
                            {row.lastError
                              ? t('boardError', { error: row.lastError })
                              : row.lastRunAt
                                ? t('boardLast', { time: time.format(row.lastRunAt), result: row.lastResult ?? '' })
                                : t('boardNever')}
                          </span>
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        {t('customers')}
                        <select name="oneCustomer" defaultValue={row.oneCustomer === null ? 'auto' : row.oneCustomer ? 'yes' : 'no'} className="h-7 rounded border border-border bg-background px-1 text-xs text-foreground">
                          <option value="auto">{t('customersAuto')}</option>
                          <option value="no">{t('customersEach')}</option>
                          <option value="yes">{t('customersOne')}</option>
                        </select>
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                        <input type="checkbox" name="includeArchived" defaultChecked={row.includeArchived} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                        {t('archived')}
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                        <input type="checkbox" name="makeBoard" defaultChecked={row.makeBoard} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                        {t('makeBoard')}
                      </label>
                      <div className="flex items-center gap-2">
                        <button type="submit" className={btn.outlineSm}>
                          {t('save')}
                        </button>
                        {row.enabled && <TrelloSyncButton boardId={row.id} small />}
                      </div>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('wizardTitle')} description={t('wizardHint')}>
            <Link href="/settings/import-trello" className={btn.outline}>
              {t('wizardLink')}
            </Link>
          </Card>
        </>
      )}
    </div>
  )
}
