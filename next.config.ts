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
  },
}

export default withNextIntl(nextConfig)
