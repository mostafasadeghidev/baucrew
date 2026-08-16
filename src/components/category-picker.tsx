'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

/**
 * Free-text input with live suggestions from the categories already in use.
 * Typing something new offers "„X“ als neue Kategorie anlegen" — choosing it
 * simply keeps the text (the category exists as soon as an item uses it).
 */
export function CategoryPicker({
  name,
  label,
  defaultValue,
  categories,
}: {
  name: string
  label: string
  defaultValue: string
  categories: string[]
}) {
  const t = useTranslations('warehouse')
  const id = useId()
  const [value, setValue] = useState(defaultValue)
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

  const q = value.trim().toLowerCase()
  const matches = categories.filter((c) => !q || c.toLowerCase().includes(q))
  const exact = categories.some((c) => c.toLowerCase() === q)
  const canCreate = q.length > 0 && !exact
  const rows: Array<{ kind: 'existing' | 'create'; label: string }> = [
    ...matches.map((c) => ({ kind: 'existing' as const, label: c })),
    ...(canCreate ? [{ kind: 'create' as const, label: value.trim() }] : []),
  ]

  function choose(row: { kind: 'existing' | 'create'; label: string }) {
    setValue(row.label)
    setOpen(false)
    setActive(-1)
  }

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || rows.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(rows.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault()
            choose(rows[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        className={inputClass}
      />
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
                choose(row)
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${
                i === active ? 'bg-accent/10 text-accent' : 'hover:bg-surface-hover'
              } ${row.kind === 'create' ? 'border-t border-border font-medium text-accent' : ''}`}
            >
              {row.kind === 'create' ? `＋ ${t('createCategory', { name: row.label })}` : row.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
