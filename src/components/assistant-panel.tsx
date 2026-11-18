'use client'

/**
 * The assistant: a button over the bell in the corner, and behind it a panel
 * along the right edge where the office talks to the app — "lege ein Projekt
 * an", "öffne das Projekt Musterhof", "ändere die Adresse von 2026-0048".
 * What it looks up is one quiet line; what it wants to change is a proposal
 * card that runs only on "Ausführen"; it can open pages and ask questions
 * with answers to click. The conversations are kept, per person, in the
 * history behind the panel's clock button (assistant/assistant-chat.tsx).
 *
 * The chat itself is loaded the first time the panel opens, and stays alive
 * while it is closed, so an answer keeps streaming and nothing is lost.
 * Without an OpenAI key on the server the panel says so and offers nothing.
 */

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Loader2, Sparkles, X } from 'lucide-react'
import { btn } from '@/components/ui/button'

const AssistantChat = dynamic(() => import('./assistant/assistant-chat'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden />
    </div>
  ),
})

/** Below this width the panel covers the page, so it steps aside when a page is opened. */
const WIDE = 640

export function AssistantPanel({ configured }: { configured: boolean }) {
  const t = useTranslations('assistant')
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="alertdialog"]')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const toggle = () => {
    setLoaded(true)
    setOpen((v) => !v)
  }
  const close = () => setOpen(false)

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={t('open')}
        title={t('title')}
        className={`fixed bottom-[4.25rem] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-accent/20 bg-accent text-accent-foreground shadow-lg transition-[transform,opacity] duration-150 hover:bg-accent-hover active:scale-95 print:hidden ${
          open ? 'pointer-events-none scale-90 opacity-0' : ''
        }`}
      >
        <Sparkles className="h-5 w-5" aria-hidden />
      </button>
      {loaded && (
        <aside
          role="dialog"
          aria-label={t('title')}
          hidden={!open}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface shadow-xl sm:inset-y-2 sm:right-2 sm:w-[28rem] sm:rounded-xl sm:border print:hidden"
        >
          {configured ? (
            <AssistantChat onClose={close} onNavigated={() => window.innerWidth < WIDE && close()} />
          ) : (
            <NotConfigured onClose={close} />
          )}
        </aside>
      )}
    </>
  )
}

function NotConfigured({ onClose }: { onClose: () => void }) {
  const t = useTranslations('assistant')
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2.5">
        <h2 className="min-w-0 flex-1 truncate px-1.5 text-sm font-semibold">{t('title')}</h2>
        <button type="button" onClick={onClose} className={btn.ghostIcon} aria-label={t('close')} title={t('close')}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-subtle text-muted">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-semibold">{t('notConfiguredTitle')}</p>
        <p className="mt-1.5 text-sm leading-6 text-muted">{t('notConfigured')}</p>
      </div>
    </>
  )
}
