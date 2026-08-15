'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

export type CityValue = { city: string; latitude: number | null; longitude: number | null }
type Suggestion = { name: string; admin1: string | null; postcode: string | null; latitude: number; longitude: number }

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

/**
 * City input with live place suggestions (Open-Meteo geocoding, Germany).
 * Picking a suggestion stores the standardised name plus coordinates (hidden
 * inputs `latitude`/`longitude`) so weather lookups are exact. Free typing is
 * still allowed; a status line says whether the place could be found.
 */
export function CityPicker({
  label,
  value,
  onChange,
  onPostcode,
  disabled,
  name = 'city',
}: {
  label: string
  value: CityValue
  onChange: (v: CityValue) => void
  /** Called with the suggestion's postcode (to prefill an empty PLZ field). */
  onPostcode?: (postcode: string) => void
  disabled?: boolean
  name?: string
}) {
  const t = useTranslations('geo')
  const id = useId()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [searchStatus, setStatus] = useState<'idle' | 'loading' | 'found' | 'notFound'>('idle')
  // Coordinates present (picked, copied from the customer, or loaded) always mean "found".
  const status = value.latitude != null && value.longitude != null ? 'found' : searchStatus
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) {
      setSuggestions([])
      setStatus('idle')
      return
    }
    setStatus('loading')
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`)
        const data = (await res.json()) as { results?: Suggestion[] }
        const list = data.results ?? []
        setSuggestions(list)
        setOpen(list.length > 0)
        setActive(-1)
        // Exact (case-insensitive) match → adopt coordinates silently.
        const exact = list.find((s) => s.name.toLowerCase() === q.trim().toLowerCase())
        if (exact) {
          onChange({ city: exact.name, latitude: exact.latitude, longitude: exact.longitude })
          setStatus('found')
        } else {
          setStatus(list.length > 0 ? 'idle' : 'notFound')
        }
      } catch {
        setSuggestions([])
        setStatus('idle')
      }
    }, 300)
  }

  function pick(s: Suggestion) {
    onChange({ city: s.name, latitude: s.latitude, longitude: s.longitude })
    if (s.postcode && onPostcode) onPostcode(s.postcode)
    setOpen(false)
    setStatus('found')
  }

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        value={value.city}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => {
          onChange({ city: e.target.value, latitude: null, longitude: null })
          search(e.target.value)
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(suggestions.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault()
            pick(suggestions[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        className={`${inputClass} disabled:opacity-60`}
      />
      <input type="hidden" name="latitude" value={value.latitude ?? ''} />
      <input type="hidden" name="longitude" value={value.longitude ?? ''} />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface py-1 text-sm shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.name}-${s.latitude}-${s.longitude}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? 'bg-accent/10 text-accent' : 'hover:bg-surface-hover'}`}
            >
              {s.name}
              <span className="ml-2 text-xs text-muted">
                {[s.postcode, s.admin1].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p
        className={`mt-1 min-h-4 text-[11px] ${
          status === 'found'
            ? 'text-emerald-700 dark:text-emerald-400'
            : status === 'notFound'
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-muted'
        }`}
        aria-live="polite"
      >
        {status === 'found'
          ? `✓ ${t('found')}`
          : status === 'notFound'
            ? `⚠ ${t('notFound')}`
            : status === 'loading'
              ? '…'
              : value.city
                ? t('typeToPick')
                : ''}
      </p>
    </div>
  )
}
