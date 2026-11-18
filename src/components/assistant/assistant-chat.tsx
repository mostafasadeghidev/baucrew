'use client'

/**
 * Inside the assistant's panel: the conversation on screen, and behind the
 * clock button the history — the person's earlier conversations by day, and
 * the archive of those put away. A new conversation sends the one on screen
 * to the history; nothing is lost by closing the panel or reloading the page.
 */

import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { UIMessage } from 'ai'
import { Archive, ArchiveRestore, ArrowLeft, Loader2, MessagesSquare, SquarePen, Trash2, X } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { pillTab } from '@/components/ui/tabs'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { groupChats, type ChatSummary } from '@/lib/assistant-history'
import {
  archiveAssistantChat,
  deleteAssistantChat,
  latestAssistantChat,
  listAssistantChats,
  openAssistantChat,
} from '@/app/assistant-actions'
import { Conversation } from './conversation'

type Current = { id: string; messages: UIMessage[] }

const freshChat = (): Current => ({ id: crypto.randomUUID(), messages: [] })

export default function AssistantChat({ onClose, onNavigated }: { onClose: () => void; onNavigated: () => void }) {
  const t = useTranslations('assistant')
  const [current, setCurrent] = useState<Current | null>(null)
  const [view, setView] = useState<'chat' | 'history'>('chat')
  // Raised whenever a conversation was saved, so an open history reads again.
  const [version, setVersion] = useState(0)

  // The panel opens on the latest conversation not put away.
  useEffect(() => {
    let live = true
    latestAssistantChat()
      .then((chat) => live && setCurrent(chat ? { id: chat.id, messages: chat.messages } : freshChat()))
      .catch(() => live && setCurrent(freshChat()))
    return () => {
      live = false
    }
  }, [])

  const startNew = () => {
    setCurrent(freshChat())
    setView('chat')
  }
  const open = async (id: string) => {
    const chat = await openAssistantChat(id)
    if (chat) setCurrent({ id: chat.id, messages: chat.messages })
    setView('chat')
  }
  const changed = useCallback(() => setVersion((v) => v + 1), [])

  const headerButtons = (
    <>
      <button type="button" onClick={startNew} className={btn.ghostIcon} aria-label={t('newChat')} title={t('newChat')}>
        <SquarePen className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={onClose} className={btn.ghostIcon} aria-label={t('close')} title={t('close')}>
        <X className="h-4 w-4" aria-hidden />
      </button>
    </>
  )

  if (view === 'history') {
    return (
      <History
        currentId={current?.id ?? null}
        version={version}
        onBack={() => setView('chat')}
        onOpen={open}
        onCurrentGone={startNew}
        buttons={headerButtons}
      />
    )
  }

  if (!current) {
    return (
      <>
        <Head title={t('title')} buttons={headerButtons} />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden />
        </div>
      </>
    )
  }

  return (
    <Conversation
      key={current.id}
      chatId={current.id}
      initialMessages={current.messages}
      onNavigated={onNavigated}
      onChanged={changed}
      header={(title) => (
        <Head
          title={title ?? t('newChat')}
          lead={
            <button type="button" onClick={() => setView('history')} className={btn.ghostIcon} aria-label={t('history')} title={t('history')}>
              <MessagesSquare className="h-4 w-4" aria-hidden />
            </button>
          }
          buttons={headerButtons}
        />
      )}
    />
  )
}

function Head({ title, lead, buttons }: { title: string; lead?: ReactNode; buttons: ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2.5">
      {lead}
      <h2 className="min-w-0 flex-1 truncate px-1.5 text-sm font-semibold">{title}</h2>
      {buttons}
    </div>
  )
}

function History({
  currentId,
  version,
  onBack,
  onOpen,
  onCurrentGone,
  buttons,
}: {
  currentId: string | null
  version: number
  onBack: () => void
  onOpen: (id: string) => Promise<void>
  onCurrentGone: () => void
  buttons: ReactNode
}) {
  const t = useTranslations('assistant')
  const format = useFormatter()
  const [archived, setArchived] = useState(false)
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [reload, setReload] = useState(0)
  const [pending, startTransition] = useTransition()
  const [opening, setOpening] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ChatSummary | null>(null)

  useEffect(() => {
    let live = true
    listAssistantChats(archived).then((list) => live && setChats(list))
    return () => {
      live = false
    }
  }, [archived, version, reload])

  const switchTo = (next: boolean) => {
    if (next === archived) return
    setChats(null)
    setArchived(next)
  }
  const act = (fn: () => Promise<unknown>, id: string) =>
    startTransition(async () => {
      await fn()
      if (id === currentId) onCurrentGone()
      setReload((r) => r + 1)
    })
  const now = new Date()

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2.5">
        <button type="button" onClick={onBack} className={btn.ghostIcon} aria-label={t('back')} title={t('back')}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <h2 className="min-w-0 flex-1 truncate px-1.5 text-sm font-semibold">{t('history')}</h2>
        {buttons}
      </div>
      <div className="flex shrink-0 gap-0.5 px-3 pt-3" role="tablist">
        <button type="button" role="tab" aria-selected={!archived} onClick={() => switchTo(false)} className={`${pillTab.base} ${archived ? pillTab.off : pillTab.on}`}>
          {t('chats')}
        </button>
        <button type="button" role="tab" aria-selected={archived} onClick={() => switchTo(true)} className={`${pillTab.base} ${archived ? pillTab.on : pillTab.off}`}>
          <Archive className="h-3.5 w-3.5" aria-hidden />
          {t('archive')}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-2">
        {chats === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden />
          </div>
        ) : chats.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted">{archived ? t('archiveEmpty') : t('historyEmpty')}</p>
        ) : (
          groupChats(chats, now).map(({ group, chats: rows }) => (
            <section key={group} className="mt-3 first:mt-1">
              <h3 className="px-2.5 pb-1 text-xs font-medium text-muted">{t(`groups.${group}`)}</h3>
              <ul>
                {rows.map((chat) => (
                  <li key={chat.id} className="group relative">
                    <button
                      type="button"
                      disabled={opening !== null}
                      onClick={async () => {
                        setOpening(chat.id)
                        await onOpen(chat.id)
                        setOpening(null)
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg py-2 pl-2.5 pr-20 text-left transition-colors hover:bg-surface-hover ${
                        chat.id === currentId ? 'bg-subtle' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{chat.title}</span>
                        <span className="block text-xs text-muted">
                          {format.dateTime(new Date(chat.updatedAt), group === 'today' || group === 'yesterday' ? { timeStyle: 'short' } : { dateStyle: 'medium' })}
                        </span>
                      </span>
                      {opening === chat.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden />}
                    </button>
                    <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
                      {archived ? (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => act(() => archiveAssistantChat(chat.id, false), '')}
                            className={btn.ghostIcon}
                            aria-label={t('restore')}
                            title={t('restore')}
                          >
                            <ArchiveRestore className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => setDeleting(chat)}
                            className={`${btn.ghostIcon} hover:text-danger`}
                            aria-label={t('delete')}
                            title={t('delete')}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => act(() => archiveAssistantChat(chat.id, true), chat.id)}
                          className={btn.ghostIcon}
                          aria-label={t('archiveOne')}
                          title={t('archiveOne')}
                        >
                          <Archive className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <AlertDialog
        open={deleting !== null}
        title={t('deleteTitle')}
        description={deleting ? t('deleteText', { title: deleting.title }) : undefined}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const chat = deleting
          setDeleting(null)
          if (chat) act(() => deleteAssistantChat(chat.id), chat.id)
        }}
      />
    </>
  )
}
