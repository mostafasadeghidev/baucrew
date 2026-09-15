import Link from 'next/link'
import { after } from 'next/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { DeleteButton } from '@/components/delete-button'
import { Card } from '@/components/ui/card'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'
import { DELIVERY_HEADER, EVENT_HEADER, SIGNATURE_HEADER, WEBHOOK_EVENTS, TEST_EVENT } from '@/lib/webhook-events'
import { processDueDeliveries } from '@/lib/webhooks'
import { deleteWebhook } from './actions'
import { WebhookForm } from './webhook-form'
import { EndpointControls, EndpointEvents, ResendButton } from './endpoint-controls'

const EVENT_LABEL = {
  'project.created': 'webhookEventCreated',
  'project.status_changed': 'webhookEventStatus',
  'project.updated': 'webhookEventUpdated',
  'project.deleted': 'webhookEventDeleted',
  'invoice.ready': 'webhookEventInvoiceReady',
} as const

/**
 * Settings → Webhooks: where the app tells automations what happened. An
 * endpoint is an address n8n gave; the list below it shows what went out, what
 * waits for another attempt and what was given up.
 */
export default async function WebhooksPage() {
  await requireAdmin()
  const [t, tNav, locale] = await Promise.all([getTranslations('settings'), getTranslations('nav'), getLocale()])
  // Opening the page nudges what is due, after it is drawn: an endpoint that
  // does not answer must not keep the page waiting.
  after(() => processDueDeliveries())

  const [endpoints, deliveries] = await Promise.all([
    db.webhookEndpoint.findMany({ orderBy: { createdAt: 'asc' } }),
    db.webhookDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        event: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        responseStatus: true,
        lastError: true,
        createdAt: true,
        endpoint: { select: { name: true } },
      },
    }),
  ])

  const events = WEBHOOK_EVENTS.map((value) => ({ value, label: t(EVENT_LABEL[value]) }))
  const eventName = (event: string) =>
    event === TEST_EVENT ? t('webhookEventTest') : event in EVENT_LABEL ? t(EVENT_LABEL[event as keyof typeof EVENT_LABEL]) : event
  const time = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'short', timeStyle: 'short' })
  const code = 'block overflow-x-auto whitespace-pre rounded-md border border-border bg-background px-3 py-2 text-xs'
  const th = 'px-2 py-2 font-medium'

  return (
    <div className="space-y-6">
      <StickyHead>
        <PageBar back={{ href: '/settings?tab=data', label: tNav('settings') }} title={t('webhooksTitle')} />
      </StickyHead>
      <PageHint className="max-w-3xl">{t('webhooksHint')}</PageHint>

      <Card title={t('webhookNewTitle')} description={t('webhookNewHint')}>
        <WebhookForm events={events} />
      </Card>

      <Card title={t('webhookListTitle')}>
        {endpoints.length === 0 ? (
          <p className="text-sm text-muted">{t('webhookNone')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {endpoint.name}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          endpoint.active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-subtle text-muted'
                        }`}
                      >
                        {endpoint.active ? t('webhookActive') : t('webhookPaused')}
                      </span>
                    </p>
                    <p className="mt-0.5 break-all font-mono text-xs text-muted">{endpoint.url}</p>
                  </div>
                  <DeleteButton
                    action={deleteWebhook.bind(null, endpoint.id)}
                    label={t('webhookDelete')}
                    confirmMessage={t('webhookDeleteConfirm', { name: endpoint.name })}
                  />
                </div>
                <EndpointEvents id={endpoint.id} selected={endpoint.events} events={events} />
                <EndpointControls id={endpoint.id} active={endpoint.active} secret={endpoint.secret} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('webhookDeliveriesTitle')} description={t('webhookDeliveriesHint')}>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted">{t('webhookDeliveriesNone')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className={th}>{t('webhookColTime')}</th>
                  <th className={th}>{t('webhookColEndpoint')}</th>
                  <th className={th}>{t('webhookColEvent')}</th>
                  <th className={th}>{t('webhookColStatus')}</th>
                  <th className={th}>{t('webhookColAnswer')}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deliveries.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums">{time.format(d.createdAt)}</td>
                    <td className="px-2 py-2">{d.endpoint.name}</td>
                    <td className="px-2 py-2">
                      {eventName(d.event)}
                      <span className="block font-mono text-[11px] text-muted">{d.event}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <span
                        className={
                          d.status === 'delivered'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : d.status === 'failed'
                              ? 'text-danger'
                              : 'text-amber-700 dark:text-amber-400'
                        }
                      >
                        {d.status === 'delivered'
                          ? t('webhookDelivered')
                          : d.status === 'failed'
                            ? t('webhookFailed')
                            : t('webhookPending')}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {t('webhookAttempts', { count: d.attempts })}
                        {d.status === 'pending' && d.attempts > 0 && ` · ${t('webhookNextTry', { time: time.format(d.nextAttemptAt) })}`}
                      </span>
                    </td>
                    <td className="max-w-72 px-2 py-2 text-xs text-muted">
                      {d.responseStatus !== null && <span className="tabular-nums">HTTP {d.responseStatus}</span>}
                      {d.lastError && <span className="block break-words text-danger">{d.lastError}</span>}
                    </td>
                    <td className="px-2 py-2 text-right">{d.status !== 'delivered' && <ResendButton id={d.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('webhookHowTitle')} description={t('webhookHowHint')}>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">{t('webhookHowHeaders')}</p>
            <code className={code}>{`Content-Type: application/json
${EVENT_HEADER}: project.status_changed
${DELIVERY_HEADER}: <id>
${SIGNATURE_HEADER}: sha256=<hex>`}</code>
          </div>
          <div>
            <p className="font-medium">{t('webhookHowBody')}</p>
            <code className={code}>{JSON.stringify(
              {
                id: '8c1f…',
                event: 'project.status_changed',
                occurredAt: '2026-09-14T08:12:00.000Z',
                data: {
                  project: {
                    id: 'cm…',
                    number: '2026-0048',
                    name: 'Musterstraße 12, Fassade',
                    status: 'QUOTED',
                    statusSince: '2026-09-14T08:12:00.000Z',
                    customer: { id: 'cm…', name: 'Muster GmbH', email: 'info@muster.example', phone: null },
                    links: [{ system: 'trello', externalId: '64f…', url: 'https://trello.com/c/…' }],
                  },
                  from: 'LEAD',
                  to: 'QUOTED',
                  actor: { type: 'user', userId: 'cm…' },
                },
              },
              null,
              2
            )}</code>
          </div>
          <p className="text-xs text-muted">
            {t('webhookHowDocs')}{' '}
            <Link href="/settings/api-keys" className="text-accent hover:underline">
              {t('apiKeysTitle')}
            </Link>
          </p>
        </div>
      </Card>
    </div>
  )
}
