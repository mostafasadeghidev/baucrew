'use client'

/**
 * One conversation with the assistant: the messages, and the field to write
 * in. Kept on the server as it goes (the route saves it after every answer),
 * so closing the panel, reloading or going to another page loses nothing.
 *
 * Two of the assistant's tools run here in the browser: `open_page` takes
 * the person to a page — the panel stays open beside it — and `ask_user`
 * shows a question with answers to click (typing answers it too).
 */

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai'
import { ArrowDown, ArrowUp, RotateCcw, Sparkles, Square } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { isClientTool, openQuestion, proposalWaiting, safeAppPath, shouldContinue } from '@/lib/assistant-client-tools'
import { MessageText, PageLine, ProposalCard, QuestionCard, Steps, Thinking, toolNameOf, type ToolPart } from './parts'

/** What the model reads for a declined proposal — plain enough that it cannot report the change as done. */
const DECLINED = 'The person declined this change. It was NOT carried out and nothing was changed.'

/** Within this many pixels of the end the list follows what streams in. */
const STICK = 96
/** Text shorter than this right before a proposal is taken for an announcement of it. */
const ANNOUNCEMENT = 280

export function Conversation({
  chatId,
  initialMessages,
  header,
  onNavigated,
  onChanged,
}: {
  chatId: string
  initialMessages: UIMessage[]
  header: (title: string | null) => ReactNode
  /** A page was opened for the person. */
  onNavigated: () => void
  /** The conversation was saved anew — the history is out of date. */
  onChanged: () => void
}) {
  const t = useTranslations('assistant')
  const router = useRouter()
  const [input, setInput] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const [atEnd, setAtEnd] = useState(true)
  const [resumable, setResumable] = useState(() => shouldContinue({ messages: initialMessages }))

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/assistant',
        // Where the person is, so "dieses Projekt" means the one on screen.
        body: () => ({ page: `${window.location.pathname}${window.location.search}` }),
      }),
    []
  )

  const { messages, sendMessage, addToolApprovalResponse, addToolOutput, status, stop, error, clearError, regenerate } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: shouldContinue,
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName !== 'open_page') return
      const path = safeAppPath((toolCall.input as { path?: unknown })?.path)
      if (!path) {
        void addToolOutput({ state: 'output-error', tool: 'open_page', toolCallId: toolCall.toolCallId, errorText: 'Not a page of this app.' })
        return
      }
      router.push(path)
      void addToolOutput({ tool: 'open_page', toolCallId: toolCall.toolCallId, output: { opened: path } })
      onNavigated()
    },
    onFinish: ({ message }) => {
      onChanged()
      // A change has landed: the page behind the panel shows it.
      if (message.parts.some((p) => isToolUIPart(p) && p.state === 'output-available' && p.approval?.approved)) router.refresh()
    },
  })
  const busy = status === 'submitted' || status === 'streaming'
  const question = openQuestion(messages)
  const waiting = proposalWaiting(messages)
  const title = messages.find((m) => m.role === 'user')?.parts.find((p) => p.type === 'text')?.text ?? null

  // Follow what streams in — unless the person scrolled up to read.
  useEffect(() => {
    if (atEnd) scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages, status, atEnd])

  useEffect(() => {
    field.current?.focus()
  }, [])

  const onScroll = () => {
    const el = scroller.current
    if (el) setAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight < STICK)
  }
  const toEnd = () => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
    setAtEnd(true)
  }

  const answerQuestion = (toolCallId: string, answer: string) => void addToolOutput({ tool: 'ask_user', toolCallId, output: { answer } })

  const send = (text: string) => {
    const clean = text.trim()
    if (!clean || busy || waiting) return
    clearError()
    setAtEnd(true)
    setResumable(false)
    // A typed line while a question waits is its answer.
    if (question) answerQuestion(question.toolCallId, clean)
    else void sendMessage({ text: clean })
    setInput('')
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(input)
    }
  }
  const answer = (id: string, approved: boolean) =>
    void addToolApprovalResponse({ id, approved, ...(approved ? {} : { reason: DECLINED }) })

  const last = messages[messages.length - 1]
  const lastPart = last?.role === 'assistant' ? [...last.parts].reverse().find(visible) : undefined
  // At work and nothing new to see yet: before the first word, or between a look-up and what follows.
  const showThinking =
    status === 'submitted' || (status === 'streaming' && (!lastPart || (isToolUIPart(lastPart) && lastPart.state === 'output-available')))
  // Opened on an answer cut off before it was finished (the page was left while it ran): it can go on.
  const interrupted = resumable && status === 'ready' && !error

  return (
    <>
      {header(title)}
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain" aria-live="polite">
          {messages.length === 0 ? (
            <Welcome onPick={send} />
          ) : (
            <div className="space-y-6 px-4 py-5">
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end pl-10">
                    <p className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-subtle px-3.5 py-2 text-sm leading-6 text-foreground">
                      {m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')}
                    </p>
                  </div>
                ) : (
                  <AssistantMessage
                    key={m.id}
                    message={m}
                    streaming={status === 'streaming' && i === messages.length - 1}
                    busy={busy}
                    onAnswer={answer}
                    onQuestion={answerQuestion}
                    onUndo={send}
                  />
                )
              )}
              {showThinking && <Thinking label={t('thinking')} />}
              {interrupted && (
                <div className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 text-sm">
                  <p className="flex-1 text-muted">{t('interrupted')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setResumable(false)
                      void sendMessage()
                    }}
                    className={btn.outlineSm}
                  >
                    {t('continue')}
                  </button>
                </div>
              )}
              {error && (
                <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger">
                  <p className="flex-1">{t('error')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      clearError()
                      void regenerate()
                    }}
                    className="inline-flex shrink-0 items-center gap-1 font-medium hover:underline"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    {t('retry')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {!atEnd && (
          <button
            type="button"
            onClick={toEnd}
            aria-label={t('toEnd')}
            className="absolute bottom-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border-strong bg-surface text-muted shadow-md hover:text-foreground"
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 px-3 pb-3 pt-1">
        <div className="rounded-2xl border border-border-strong bg-surface transition-[border-color,box-shadow] focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/10">
          <textarea
            ref={field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={waiting}
            placeholder={waiting ? t('placeholderWaiting') : question ? t('placeholderAnswer') : t('placeholder')}
            aria-label={t('placeholder')}
            className="block max-h-40 min-h-[2.75rem] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-sm leading-6 outline-none [field-sizing:content] placeholder:text-muted disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-2 px-2.5 pb-2.5">
            <p className="hidden flex-1 truncate pl-1 text-xs text-muted sm:block">{t('composerHint')}</p>
            <span className="flex-1 sm:hidden" />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label={t('stop')}
                title={t('stop')}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-surface transition-transform active:scale-95"
              >
                <Square className="h-3 w-3 fill-current" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || waiting}
                aria-label={t('send')}
                title={t('send')}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground transition-[background-color,opacity,transform] hover:bg-accent-hover active:scale-95 disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </form>
    </>
  )
}

/** A part the person sees — anything but the step marks between rounds. */
const visible = (p: UIMessage['parts'][number]) => (p.type === 'text' ? p.text.trim() !== '' : isToolUIPart(p))

function AssistantMessage({
  message,
  streaming,
  busy,
  onAnswer,
  onQuestion,
  onUndo,
}: {
  message: UIMessage
  streaming: boolean
  busy: boolean
  onAnswer: (id: string, approved: boolean) => void
  onQuestion: (toolCallId: string, answer: string) => void
  onUndo: (text: string) => void
}) {
  // Look-ups that follow each other share one line.
  const blocks: Array<{ kind: 'text'; text: string; key: string } | { kind: 'steps'; parts: ToolPart[] } | { kind: 'tool'; part: ToolPart }> = []
  message.parts.forEach((part, i) => {
    if (part.type === 'text') {
      if (part.text.trim()) blocks.push({ kind: 'text', text: part.text, key: `t${i}` })
      return
    }
    if (!isToolUIPart(part)) return
    const name = toolNameOf(part)
    const isLookUp = !isClientTool(name) && !('approval' in part && part.approval)
    const prev = blocks[blocks.length - 1]
    if (isLookUp && prev?.kind === 'steps') prev.parts.push(part)
    else if (isLookUp) blocks.push({ kind: 'steps', parts: [part] })
    else blocks.push({ kind: 'tool', part })
  })

  // A short line right before a proposal only announces it ("Ich führe das jetzt aus") — and
  // says it happens before the person has said yes. The card says what is proposed.
  const shown = blocks.filter((b, i) => {
    const next = blocks[i + 1]
    return !(b.kind === 'text' && b.text.length < ANNOUNCEMENT && next?.kind === 'tool' && 'approval' in next.part && next.part.approval)
  })

  return (
    <div className="space-y-3">
      {shown.map((b, i) => {
        if (b.kind === 'text') return <MessageText key={b.key} text={b.text} streaming={streaming && i === shown.length - 1} />
        if (b.kind === 'steps') return <Steps key={b.parts[0].toolCallId} parts={b.parts} />
        const name = toolNameOf(b.part)
        if (name === 'open_page') return <PageLine key={b.part.toolCallId} part={b.part} />
        if (name === 'ask_user') return <QuestionCard key={b.part.toolCallId} part={b.part} busy={busy} onAnswer={onQuestion} />
        return <ProposalCard key={b.part.toolCallId} part={b.part} busy={busy} onAnswer={onAnswer} onUndo={onUndo} />
      })}
    </div>
  )
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  const t = useTranslations('assistant')
  const examples = [t('example1'), t('example2'), t('example3'), t('example4')]
  return (
    <div className="flex min-h-full flex-col justify-end px-4 pb-4 pt-10">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
        <Sparkles className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{t('welcome')}</h3>
      <p className="mt-1 text-sm leading-6 text-muted">{t('intro')}</p>
      <div className="mt-5 flex flex-col gap-2">
        {examples.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="rounded-xl border border-border px-3.5 py-2.5 text-left text-sm transition-[background-color,border-color,transform] duration-100 hover:border-border-strong hover:bg-surface-hover active:scale-[0.99]"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
