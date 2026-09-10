import { headers } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { DeleteButton } from '@/components/delete-button'
import { Card } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { KeyForm } from './key-form'
import { revokeApiKey } from './actions'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'

/** Settings → API keys: who may talk to the app from outside, and how. */
export default async function ApiKeysPage() {
  await requireAdmin()
  const [t, tNav, locale, h] = await Promise.all([getTranslations('settings'), getTranslations('nav'), getLocale(), headers()])

  const [keys, users] = await Promise.all([
    db.apiKey.findMany({
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        user: { select: { username: true } },
      },
    }),
    db.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'MANAGER'] } },
      orderBy: { username: 'asc' },
      select: { id: true, username: true, role: true },
    }),
  ])

  // The address programs use: what this page was reached under.
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:15700'
  const base = `${proto}://${host}`
  const code = 'block overflow-x-auto whitespace-pre rounded-md border border-border bg-background px-3 py-2 text-xs'

  return (
    <div className="space-y-6">
      <StickyHead>
        <PageBar back={{ href: '/settings?tab=data', label: tNav('settings') }} title={t('apiKeysTitle')} />
      </StickyHead>
      <PageHint className="max-w-3xl">{t('apiKeysHint')}</PageHint>

      <Card title={t('newKeyTitle')} description={t('newKeyHint')}>
        <KeyForm users={users.map((u) => ({ value: u.id, label: `${u.username} (${u.role})` }))} />
      </Card>

      <Card title={t('keyListTitle')}>
        {keys.length === 0 ? (
          <p className="text-sm text-muted">{t('noKeys')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-2 py-2 font-medium">{t('keyName')}</th>
                  <th className="px-2 py-2 font-medium">{t('keyPrefix')}</th>
                  <th className="px-2 py-2 font-medium">{t('keyUser')}</th>
                  <th className="px-2 py-2 font-medium">{t('keyCreatedAt')}</th>
                  <th className="px-2 py-2 font-medium">{t('keyLastUsed')}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((k) => (
                  <tr key={k.id} className={k.revokedAt ? 'text-muted line-through' : undefined}>
                    <td className="px-2 py-2">{k.name}</td>
                    <td className="px-2 py-2 font-mono text-xs">{k.prefix}…</td>
                    <td className="px-2 py-2">{k.user.username}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatDate(k.createdAt, locale)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{k.lastUsedAt ? formatDate(k.lastUsedAt, locale) : t('keyNever')}</td>
                    <td className="px-2 py-2 text-right">
                      {k.revokedAt ? (
                        <span className="text-xs no-underline">{t('keyRevoked')}</span>
                      ) : (
                        <DeleteButton action={revokeApiKey.bind(null, k.id)} label={t('keyRevoke')} confirmMessage={t('keyRevokeConfirm', { name: k.name })} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('connectTitle')} description={t('connectHint')}>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">{t('connectApi')}</p>
            <p className="mb-1 text-xs text-muted">{t('connectApiHint')}</p>
            <code className={code}>{`curl -H "Authorization: Bearer KEY" ${base}/api/v1/projects?q=Muster`}</code>
          </div>
          <div>
            <p className="font-medium">{t('connectClaudeCode')}</p>
            <code className={code}>{`claude mcp add --transport http baucrew ${base}/api/mcp --header "Authorization: Bearer KEY"`}</code>
          </div>
          <div>
            <p className="font-medium">{t('connectClaudeDesktop')}</p>
            <p className="mb-1 text-xs text-muted">{t('connectClaudeDesktopHint')}</p>
            <code className={code}>{JSON.stringify(
              {
                mcpServers: {
                  baucrew: {
                    command: 'npx',
                    args: ['-y', 'mcp-remote', `${base}/api/mcp`, '--header', 'Authorization: Bearer KEY'],
                  },
                },
              },
              null,
              2
            )}</code>
          </div>
          <p className="text-xs text-muted">{t('connectDocs')}</p>
        </div>
      </Card>
    </div>
  )
}
