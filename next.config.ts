import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // A Trello board export is one big JSON file: a board of ~250 cards with
    // attachments is already ~2.5 MB, and the default server-action body limit
    // of 1 MB rejects it before the importer ever sees it.
    serverActions: { bodySizeLimit: '512mb' },
    // The proxy reads every request's body into memory first and cuts it off
    // at 10 MB by default — a 25 MB PDF or a batch of site photos for the
    // project's documentation (src/app/api/projects/[id]/documentation) would
    // arrive cut short. The routes check their own limits.
    proxyClientMaxBodySize: '40mb',
  },
  // A browser that asks for /favicon.ico on its own (a PDF in a tab, an old
  // bookmark) gets the company's icon too, not a 404 (src/app/brand-icon).
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/brand-icon' }]
  },
}

export default withNextIntl(nextConfig)
