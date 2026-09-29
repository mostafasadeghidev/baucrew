'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { DropdownPortal } from './dropdown-portal'
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
  labelClassName = 'block text-sm font-medium',
  inputClassName = inputClass,
}: {
  label: string
  value: CityValue
  onChange: (v: CityValue) => void
  /**
   * Called with the picked place's postal code, and the one this field filled
   * in before (null the first time): the postal code field takes the new one
   * when it is empty or still holds what the last pick put there.
   */
  onPostcode?: (postcode: string, replaces: string | null) => void
  disabled?: boolean
  name?: string
  /** The label's and the field's look, where the picker sits in a small window among smaller fields. */
  labelClassName?: string
  inputClassName?: string
}) {
  const t = useTranslations('geo')
  const id = useId()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [searchStatus, setStatus] = useState<'idle' | 'loading' | 'found' | 'notFound' | 'unavailable'>('idle')
  // A town with coordinates (picked, copied from the customer, or loaded) is "found"; coordinates without a town are nothing.
  const status = value.city.trim() && value.latitude != null && value.longitude != null ? 'found' : searchStatus
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The latest search asked for; an answer to an older one comes too late and is dropped. */
  const asked = useRef(0)
  /** The postal code this field filled in last, which a town picked next may replace. */
  const filledCode = useRef<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current)
    const ask = ++asked.current
    if (q.trim().length < 2) {
      setSuggestions([])
      setStatus('idle')
      return
    }
    setStatus('loading')
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`)
        const data = (await res.json()) as { results?: Suggestion[]; unavailable?: boolean }
        // Typed on, or picked, since this was asked: the answer is no longer the field's.
        if (ask !== asked.current) return
        const list = data.results ?? []
        setSuggestions(list)
        setOpen(list.length > 0)
        setActive(-1)
        // The one place of exactly that name → its coordinates silently. Where
        // several towns share the name, or the name is still being typed (a
        // space at its end), the list is left to choose from.
        const exact = list.filter((s) => s.name.toLowerCase() === q.trim().toLowerCase())
        if (exact.length === 1 && q === q.trimEnd()) {
          onChange({ city: exact[0].name, latitude: exact[0].latitude, longitude: exact[0].longitude })
          setStatus('found')
        } else {
          setStatus(list.length > 0 ? 'idle' : data.unavailable ? 'unavailable' : 'notFound')
        }
      } catch {
        if (ask !== asked.current) return
        setSuggestions([])
        setStatus('unavailable')
      }
    }, 300)
  }

  function pick(s: Suggestion) {
    // A search still on its way would put its own answer over the pick.
    if (timer.current) clearTimeout(timer.current)
    asked.current++
    onChange({ city: s.name, latitude: s.latitude, longitude: s.longitude })
    if (s.postcode && onPostcode) {
      onPostcode(s.postcode, filledCode.current)
      filledCode.current = s.postcode
    }
    setOpen(false)
    setStatus('found')
  }

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        // A disabled field is left out of the form; the hidden one below carries the town then.
        name={disabled ? undefined : name}
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
            // Closes the list, and only the list — not the window the field is in.
            e.preventDefault()
            setOpen(false)
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        className={`${inputClassName} disabled:opacity-60`}
      />
      {disabled && <input type="hidden" name={name} value={value.city} />}
      <input type="hidden" name="latitude" value={value.latitude ?? ''} />
      <input type="hidden" name="longitude" value={value.longitude ?? ''} />
      <DropdownPortal anchorRef={inputRef} open={open} id={`${id}-list`}>
        <>
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
              // A narrow field (the card's small window) puts the region under the name rather than beside it.
              className={`mx-1 flex cursor-pointer flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1.5 text-sm ${
                i === active ? 'bg-surface-hover text-foreground' : 'hover:bg-surface-hover'
              }`}
            >
              {s.name}
              <span className="text-xs text-muted">
                {[s.postcode, s.admin1].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </>
      </DropdownPortal>
      <p
        className={`mt-1 min-h-4 text-[11px] ${
          status === 'found'
            ? 'text-emerald-700 dark:text-emerald-400'
            : status === 'notFound' || status === 'unavailable'
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-muted'
        }`}
        aria-live="polite"
      >
        {status === 'found'
          ? `✓ ${t('found')}`
          : status === 'notFound'
            ? `⚠ ${t('notFound')}`
            : status === 'unavailable'
              ? `⚠ ${t('unavailable')}`
              : status === 'loading'
                ? '…'
                : value.city
                  ? t('typeToPick')
                  : ''}
      </p>
    </div>
  )
}
