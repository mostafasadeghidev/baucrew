'use client'

/**
 * The small bar over a text box, the way Trello's editor has one: bold,
 * italic, struck, a heading, lists, a quote, code, a link — each writes its
 * Markdown around what is selected, or at the caret — and, where there is
 * talk, a smile that opens a few emoji to put in.
 */

import { useCallback, useRef, useState, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { Bold, Code, Heading2, Italic, Link2, List, ListOrdered, Quote, Smile, Strikethrough } from 'lucide-react'
import { Popover } from './popover'

const EMOJI = [
  '👍', '👎', '👏', '🙏', '💪', '👌', '🤝', '👀',
  '😀', '😄', '😅', '😂', '🙂', '😉', '😊', '😍',
  '🤔', '😐', '😬', '🙄', '😢', '😡', '🥳', '😴',
  '✅', '❌', '⚠️', '❗', '❓', '💡', '📌', '📎',
  '📷', '📄', '📅', '⏰', '🔥', '⭐', '🎉', '☕',
  '🏠', '🔨', '🎨', '🧱', '🚧', '🚚', '💶', '🌧️',
]

/** Writes into a text box as typing would, so a controlled field hears it too. */
function write(el: HTMLTextAreaElement, text: string, start: number, end: number, select: [number, number]) {
  el.focus()
  el.setRangeText(text, start, end, 'end')
  el.setSelectionRange(select[0], select[1])
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function MarkdownToolbar({ target, emoji = false, className = '' }: { target: RefObject<HTMLTextAreaElement | null>; emoji?: boolean; className?: string }) {
  const t = useTranslations('format')
  const smile = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  /** Around the selection: **words**; with nothing selected, the marks with the caret between them. */
  const wrap = (left: string, right = left, placeholder = '') => {
    const el = target.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b, value } = el
    const inner = value.slice(a, b) || placeholder
    write(el, `${left}${inner}${right}`, a, b, [a + left.length, a + left.length + inner.length])
  }

  /** In front of every selected line: "- ", "1. ", "> ", "## ". */
  const prefix = (make: (i: number) => string) => {
    const el = target.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b, value } = el
    const from = value.lastIndexOf('\n', a - 1) + 1
    const toNl = value.indexOf('\n', b)
    const to = toNl === -1 ? value.length : toNl
    const lines = value.slice(from, to).split('\n')
    const text = lines.map((line, i) => `${make(i)}${line}`).join('\n')
    write(el, text, from, to, [from + text.length, from + text.length])
  }

  const link = () => {
    const el = target.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b, value } = el
    const words = value.slice(a, b) || t('linkWords')
    const text = `[${words}](https://)`
    // The address is what is left to type: the caret waits after "https://".
    const at = a + words.length + 3 + 'https://'.length
    write(el, text, a, b, [at, at])
  }

  const put = (symbol: string) => {
    const el = target.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b } = el
    write(el, symbol, a, b, [a + symbol.length, a + symbol.length])
    setOpen(false)
  }

  const tools: Array<{ icon: typeof Bold; label: string; run: () => void }> = [
    { icon: Bold, label: t('bold'), run: () => wrap('**', '**', t('boldWords')) },
    { icon: Italic, label: t('italic'), run: () => wrap('*', '*', t('italicWords')) },
    { icon: Strikethrough, label: t('strike'), run: () => wrap('~~', '~~', t('strikeWords')) },
    { icon: Heading2, label: t('heading'), run: () => prefix(() => '## ') },
    { icon: List, label: t('list'), run: () => prefix(() => '- ') },
    { icon: ListOrdered, label: t('numbered'), run: () => prefix((i) => `${i + 1}. `) },
    { icon: Quote, label: t('quote'), run: () => prefix(() => '> ') },
    { icon: Code, label: t('code'), run: () => wrap('`', '`', t('codeWords')) },
    { icon: Link2, label: t('link'), run: link },
  ]

  const button = 'flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground'
  return (
    <div role="toolbar" aria-label={t('toolbar')} className={`flex flex-wrap items-center gap-0.5 ${className}`}>
      {tools.map(({ icon: Icon, label, run }) => (
        // Pressed without taking the focus from the text, so the selection stays.
        <button key={label} type="button" title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={run} className={button}>
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      ))}
      {emoji && (
        <>
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <button
            ref={smile}
            type="button"
            title={t('emoji')}
            aria-label={t('emoji')}
            aria-expanded={open}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen((o) => !o)}
            className={button}
          >
            <Smile className="h-4 w-4" aria-hidden />
          </button>
          <Popover open={open} onClose={close} anchor={smile} label={t('emoji')} width={272}>
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => put(symbol)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none transition-colors hover:bg-surface-hover"
                >
                  {symbol}
                </button>
              ))}
            </div>
          </Popover>
        </>
      )}
    </div>
  )
}
