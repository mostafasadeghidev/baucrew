'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Select } from './ui/select'

/** Writes one query parameter (and what it clears or carries) without a history entry. */
export function useParamUpdater() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  return (param: string, value: string, clears: string[] = [], sets: Record<string, string> = {}) => {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(param, value)
    else params.delete(param)
    // Some filters carry others with them: a card that was looking at its own
    // year has no business staying there once the whole page has moved.
    for (const other of clears) params.delete(other)
    // And some rewrite others: what a choice takes along is set after what it
    // drops, so a parameter can be both. An empty value is written as one — see
    // `carry` below.
    for (const [other, carried] of Object.entries(sets)) params.set(other, carried)
    // Changing a filter always jumps back to the first page.
    params.delete('page')
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }
}

/** Debounced as-you-type search synced to a URL query param (server filters). */
export function LiveSearchInput({
  placeholder,
  param = 'q',
  className,
  autoFocus,
}: {
  placeholder: string
  param?: string
  autoFocus?: boolean
  className?: string
}) {
  const searchParams = useSearchParams()
  const update = useParamUpdater()
  const inAddress = searchParams.get(param) ?? ''
  // What is typed lives here, not in the address: a search that lands while
  // the next letters are being typed must not snap the box back to it.
  const [value, setValue] = useState(inAddress)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The searches this box sent and has not seen land yet. An address that
  // carries one of them is this box's own doing; any other is somebody else's
  // — a cleared filter, a link, the back button — and the box follows it.
  const sent = useRef<string[]>([])

  useEffect(() => {
    const own = sent.current.indexOf(inAddress)
    if (own >= 0) {
      sent.current.splice(0, own + 1)
      return
    }
    sent.current = []
    setValue(inAddress)
  }, [inAddress])

  useEffect(() => {
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
    // A delayed search must not replace a view the user has just chosen.
    const onNavigate = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (event.target instanceof Element && event.target.closest('a[href]')) cancel()
    }
    document.addEventListener('click', onNavigate, true)
    window.addEventListener('popstate', cancel)
    return () => {
      cancel()
      document.removeEventListener('click', onNavigate, true)
      window.removeEventListener('popstate', cancel)
    }
  }, [])

  function onChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      const query = next.trim()
      sent.current.push(query)
      update(param, query)
    }, 300)
  }

  return (
    <input
      type="search"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      // Its own colours, never the bar's: on the board's coloured ground the
      // bar's text is white, and white on this box was nothing to read. A
      // caller passing its own className has to bring these two along.
      className={className ?? 'min-w-52 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'}
    />
  )
}

export type LiveSelectOption = { value: string; label: string }
/** Entries can be grouped — the browser renders them as <optgroup>. */
export type LiveSelectGroup = { label: string; options: LiveSelectOption[] }

function isGroup(o: LiveSelectOption | LiveSelectGroup): o is LiveSelectGroup {
  return 'options' in o
}

/**
 * Select that applies its filter immediately on change via a URL query param.
 * `allLabel` adds the "no filter" entry on top; leave it out when one of the
 * options already carries the empty value (e.g. the current year in its place
 * in the list instead of jumping to the front).
 */
export function LiveSelect({
  param,
  options,
  allLabel,
  ariaLabel,
  className = 'min-w-44',
  compact = false,
  clears,
  value,
  carry,
}: {
  param: string
  options: Array<LiveSelectOption | LiveSelectGroup>
  allLabel?: string
  ariaLabel?: string
  className?: string
  compact?: boolean
  /** Other query parameters to drop when this one changes. */
  clears?: string[]
  /**
   * The option the page is standing on, when the address alone cannot say. A
   * default that is written as nothing can still arrive spelled out — a link
   * carrying "year=2026" in 2026 — and a select asked for a value none of its
   * options has falls back to the first one: the page shows 2026 and its year
   * picker says 2027. Whoever renders the page knows which it is.
   */
  value?: string
  /**
   * Other query parameters an option rewrites when it is chosen, by option
   * value: `{ '2025': { compare: '2026,2024' } }`.
   */
  carry?: Record<string, Record<string, string>>
}) {
  const searchParams = useSearchParams()
  const update = useParamUpdater()

  const option = (o: LiveSelectOption) => (
    <option key={o.value} value={o.value}>
      {o.label}
    </option>
  )

  return (
    <Select
      className={className}
      compact={compact}
      aria-label={ariaLabel}
      value={value ?? searchParams.get(param) ?? ''}
      onChange={(e) => update(param, e.target.value, clears, carry?.[e.target.value])}
    >
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map((o) =>
        isGroup(o) ? (
          <optgroup key={o.label} label={o.label}>
            {o.options.map(option)}
          </optgroup>
        ) : (
          option(o)
        )
      )}
    </Select>
  )
}
