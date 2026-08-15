'use client'

import { useId, useMemo, useRef, useState } from 'react'

export type ComboboxOption = { value: string; label: string }

/**
 * Searchable single-select. Filters options as you type; the chosen value is
 * submitted through a hidden input (options are already loaded server-side).
 */
export function Combobox({
  name,
  options,
  defaultValue = '',
  placeholder,
  noResultsLabel,
  required,
  onCreateNew,
  createLabel,
  onSelect,
}: {
  name: string
  options: ComboboxOption[]
  defaultValue?: string
  placeholder: string
  noResultsLabel: string
  required?: boolean
  /** When set, typing an unknown value offers a "create new" entry. */
  onCreateNew?: (query: string) => void
  createLabel?: (query: string) => string
  /** Called whenever an option is chosen. */
  onSelect?: (value: string) => void
}) {
  const initial = options.find((o) => o.value === defaultValue) ?? null
  const [selected, setSelected] = useState<ComboboxOption | null>(initial)
  const [query, setQuery] = useState(initial?.label ?? '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [openUp, setOpenUp] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  /** Open downwards unless the list would be clipped by a scrolling ancestor / viewport. */
  function openList() {
    const el = inputRef.current
    if (el) {
      let bottomLimit = window.innerHeight
      for (let p = el.parentElement; p; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY
        if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') {
          bottomLimit = Math.min(bottomLimit, p.getBoundingClientRect().bottom)
          break
        }
      }
      const rect = el.getBoundingClientRect()
      setOpenUp(bottomLimit - rect.bottom < 240 && rect.top > 240)
    }
    setOpen(true)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    // When the field shows the selected label, offer the full list again.
    if (!q || (selected && query === selected.label)) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [query, options, selected])

  function choose(option: ComboboxOption) {
    setSelected(option)
    setQuery(option.label)
    setOpen(false)
    onSelect?.(option.value)
  }

  function onInputChange(next: string) {
    setQuery(next)
    openList()
    setHighlight(0)
    if (selected && next !== selected.label) setSelected(null)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      openList()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && filtered[highlight]) {
        e.preventDefault()
        choose(filtered[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        required={required && !selected}
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={openList}
        ref={inputRef}
        onKeyDown={onKeyDown}
        onBlur={() => {
          blurTimer.current = setTimeout(() => {
            setOpen(false)
            // Restore the selected label if the typed text matches nothing.
            if (selected) setQuery(selected.label)
            else if (query && !options.some((o) => o.label === query)) setQuery('')
          }, 150)
        }}
        className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <input type="hidden" name={name} value={selected?.value ?? ''} />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute z-20 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg ${
            openUp ? 'bottom-full mb-1' : 'mt-1'
          }`}
        >
          {filtered.length === 0 && !onCreateNew ? (
            <li className="px-3 py-2 text-sm text-muted">{noResultsLabel}</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={selected?.value === o.value}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (blurTimer.current) clearTimeout(blurTimer.current)
                  choose(o)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === highlight ? 'bg-accent text-accent-foreground' : ''
                }`}
              >
                {o.label}
              </li>
            ))
          )}
          {onCreateNew &&
            query.trim() &&
            !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()) && (
              <li
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (blurTimer.current) clearTimeout(blurTimer.current)
                  setOpen(false)
                  onCreateNew(query.trim())
                }}
                className="cursor-pointer border-t border-border px-3 py-2 text-sm font-medium text-accent hover:bg-surface-hover"
              >
                {createLabel ? createLabel(query.trim()) : `+ ${query.trim()}`}
              </li>
            )}
        </ul>
      )}
    </div>
  )
}
