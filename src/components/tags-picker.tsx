'use client'

import { useEffect, useId, useRef, useState } from 'react'

/**
 * Multi-value tag input (chips) with live suggestions from existing values and
 * a "create „X“" entry for new ones. Submits the selection as a single hidden
 * field (comma-separated) so existing server parsers keep working.
 */
export function TagsPicker({
  name,
  label,
  defaultValues,
  suggestions,
  createLabel,
  removeLabel,
  hint,
}: {
  name: string
  label: string
  defaultValues: string[]
  suggestions: string[]
  createLabel: (value: string) => string
  removeLabel: string
  hint?: string
}) {
  const id = useId()
  const [tags, setTags] = useState<string[]>(defaultValues)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const q = query.trim().toLowerCase()
  const has = (v: string) => tags.some((t) => t.toLowerCase() === v.toLowerCase())
  const matches = suggestions.filter((s) => !has(s) && (!q || s.toLowerCase().includes(q)))
  const exactExists = suggestions.some((s) => s.toLowerCase() === q) || has(query.trim())
  const canCreate = q.length > 0 && !exactExists
  const rows: Array<{ kind: 'existing' | 'create'; label: string }> = [
    ...matches.map((s) => ({ kind: 'existing' as const, label: s })),
    ...(canCreate ? [{ kind: 'create' as const, label: query.trim() }] : []),
  ]

  function add(v: string) {
    const clean = v.trim()
    if (!clean || has(clean)) return
    setTags((prev) => [...prev, clean])
    setQuery('')
    setActive(-1)
  }

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input type="hidden" name={name} value={tags.join(', ')} />
      <div className={`mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent`}>
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
          >
            {tag}
            <button
              type="button"
              onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
              aria-label={`${removeLabel}: ${tag}`}
              className="rounded-full px-1 leading-none hover:bg-accent/20"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={query}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !query && tags.length > 0) {
              setTags((prev) => prev.slice(0, -1))
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              if (open && active >= 0 && rows[active]) add(rows[active].label)
              else if (query.trim()) add(query)
              return
            }
            if (e.key === ',') {
              e.preventDefault()
              if (query.trim()) add(query)
              return
            }
            if (!open) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(rows.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
        />
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {open && rows.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface py-1 text-sm shadow-lg"
        >
          {rows.map((row, i) => (
            <li
              key={`${row.kind}-${row.label}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                add(row.label)
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${
                i === active ? 'bg-accent/10 text-accent' : 'hover:bg-surface-hover'
              } ${row.kind === 'create' ? 'border-t border-border font-medium text-accent' : ''}`}
            >
              {row.kind === 'create' ? `＋ ${createLabel(row.label)}` : row.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
