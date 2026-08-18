'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { DropdownPortal } from './dropdown-portal'

export type ComboboxOption = { value: string; label: string }

/**
 * Searchable single-select. Filters options as you type; the chosen value is
 * submitted through a hidden input (options are already loaded server-side).
 */
export function Combobox({
  name,
  formId,
  options,
  defaultValue = '',
  placeholder,
  noResultsLabel,
  required,
  onCreateNew,
  createLabel,
  onSelect,
  clearable = false,
  clearLabel = '✕',
}: {
  name: string
  /** Submit the hidden input with a form elsewhere in the document. */
  formId?: string
  options: ComboboxOption[]
  defaultValue?: string
  placeholder: string
  noResultsLabel: string
  required?: boolean
  /** When set, typing an unknown value offers a "create new" entry. */
  onCreateNew?: (query: string) => void
  createLabel?: (query: string) => string
  /** Tooltip of the ✕ button. */
  clearLabel?: string
  /** Called whenever an option is chosen (empty string when cleared). */
  onSelect?: (value: string) => void
  /** Show an ✕ that clears the selection (optional fields). */
  clearable?: boolean
}) {
  const initial = options.find((o) => o.value === defaultValue) ?? null
  const [selected, setSelected] = useState<ComboboxOption | null>(initial)
  const [query, setQuery] = useState(initial?.label ?? '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  /** The list is rendered in a portal (see DropdownPortal) so no card clips it. */
  function openList() {
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
        className="mt-1 block w-full rounded-md border border-border bg-background py-2 pl-3 pr-9 text-sm shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {clearable && (selected || query) ? (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            if (blurTimer.current) clearTimeout(blurTimer.current)
            setSelected(null)
            setQuery('')
            setOpen(false)
            onSelect?.('')
          }}
          title={clearLabel}
          aria-label={clearLabel}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <ChevronsUpDown
          aria-hidden
          onMouseDown={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
            openList()
          }}
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 cursor-pointer text-muted"
        />
      )}
      <input type="hidden" form={formId} name={name} value={selected?.value ?? ''} />
      <DropdownPortal anchorRef={inputRef} open={open} id={listId}>
        <>
          {filtered.length === 0 && !onCreateNew ? (
            <li className="px-2 py-6 text-center text-sm text-muted">{noResultsLabel}</li>
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
                className={`mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  i === highlight ? 'bg-surface-hover text-foreground' : ''
                }`}
              >
                <Check
                  aria-hidden
                  className={`h-4 w-4 shrink-0 text-accent ${selected?.value === o.value ? '' : 'opacity-0'}`}
                />
                <span className="truncate">{o.label}</span>
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
                className="mx-1 mt-1 flex cursor-pointer items-center gap-2 rounded-md border-t border-border px-2 py-1.5 text-sm font-medium text-accent hover:bg-surface-hover"
              >
                <Plus aria-hidden className="h-4 w-4 shrink-0" />
                <span className="truncate">{createLabel ? createLabel(query.trim()) : query.trim()}</span>
              </li>
            )}
        </>
      </DropdownPortal>
    </div>
  )
}
