import type { Metadata } from 'next'
import Script from 'next/script'
import { Geist } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { getBranding, shiftColor } from '@/lib/branding'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding()
  return {
    title: branding.companyName,
    description: 'Einsatz- und Projektverwaltung',
    // See the note on <html translate="no"> below.
    other: { google: 'notranslate' },
  }
}

// Applies the stored theme before first paint to avoid a flash of wrong theme.
// Light unless somebody chose otherwise: dark by choice, or the system's by choice.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  // Company colour from Settings — overrides the accent tokens app-wide.
  const { accentColor } = await getBranding()
  const accentCss = `:root,.dark{--accent:${accentColor};--accent-hover:${shiftColor(accentColor, -18)};--ring:${accentColor};}`
  return (
    /*
     * Not for the browser to translate. A page translator (Chrome's own, or an
     * extension) takes every text node out and puts a <font> in its place;
     * React still holds the node that is gone, and the next update of that
     * spot — an invoice marked ready, a comment sent — dies with "insertBefore:
     * the node … is not a child of this node", taking the page with it. The
     * app speaks its own languages (the menu, top right), so nothing is lost:
     * `translate="no"` is the standard's word for it, the `notranslate` class
     * and the google meta tag are the ones Chrome's translator listens to.
     */
    <html lang={locale} translate="no" className={`${geistSans.variable} notranslate h-full`} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <style id="brand-accent">{accentCss}</style>
      </head>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
