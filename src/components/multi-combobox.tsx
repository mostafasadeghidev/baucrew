'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import type { ComboboxOption } from './combobox'
import { DropdownPortal } from './dropdown-portal'

/**
 * Searchable multi-select: chosen items render as removable chips, the input
 * filters the remaining options as you type. Controlled via value/onChange.
 */
export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder,
  noResultsLabel,
}: {
  options: ComboboxOption[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
  noResultsLabel: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  function openList() {
    setOpen(true)
  }

  const selected = useMemo(
    () => value.map((v) => options.find((o) => o.value === v)).filter((o): o is ComboboxOption => !!o),
    [value, options]
  )
  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options.filter(
      (o) => !value.includes(o.value) && (!q || o.label.toLowerCase().includes(q))
    )
  }, [options, value, query])

  function add(option: ComboboxOption) {
    onChange([...value, option.value])
    setQuery('')
    setHighlight(0)
  }

  function remove(v: string) {
    onChange(value.filter((x) => x !== v))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !query && value.length) {
      remove(value[value.length - 1])
      return
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      openList()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, available.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && available[highlight]) {
        e.preventDefault()
        add(available[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <div
        ref={boxRef}
        className="relative mt-1 flex min-h-10 flex-wrap items-center gap-1 rounded-md border border-border bg-background py-1 pl-2 pr-8 shadow-sm transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-ring"
      >
        {selected.map((o) => (
          <span
            key={o.value}
            className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-sm font-medium text-accent"
          >
            {o.label}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => remove(o.value)}
              aria-label={`× ${o.label}`}
              className="rounded-full px-1 hover:bg-accent/20"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          placeholder={selected.length === 0 ? placeholder : ''}
          ref={inputRef}
          onChange={(e) => {
            setQuery(e.target.value)
            openList()
            setHighlight(0)
          }}
          onFocus={openList}
          onKeyDown={onKeyDown}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150)
          }}
          className="min-w-24 flex-1 bg-transparent px-1 py-1 text-sm focus:outline-none"
        />
        <ChevronsUpDown aria-hidden className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
      <DropdownPortal anchorRef={boxRef} open={open} id={listId}>
        <>
          {available.length === 0 ? (
            <li className="px-2 py-6 text-center text-sm text-muted">{noResultsLabel}</li>
          ) : (
            available.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (blurTimer.current) clearTimeout(blurTimer.current)
                  add(o)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  i === highlight ? 'bg-surface-hover text-foreground' : ''
                }`}
              >
                <Check aria-hidden className="h-4 w-4 shrink-0 opacity-0" />
                <span className="truncate">{o.label}</span>
              </li>
            ))
          )}
        </>
      </DropdownPortal>
    </div>
  )
}
