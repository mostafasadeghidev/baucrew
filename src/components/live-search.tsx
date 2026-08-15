'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

function useParamUpdater() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  return (param: string, value: string) => {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(param, value)
    else params.delete(param)
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
}: {
  placeholder: string
  param?: string
}) {
  const searchParams = useSearchParams()
  const update = useParamUpdater()
  const [value, setValue] = useState(searchParams.get(param) ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => update(param, next.trim()), 300)
  }

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-w-52 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
    />
  )
}

/** Select that applies its filter immediately on change via a URL query param. */
export function LiveSelect({
  param,
  options,
  allLabel,
}: {
  param: string
  options: Array<{ value: string; label: string }>
  allLabel: string
}) {
  const searchParams = useSearchParams()
  const update = useParamUpdater()

  return (
    <select
      value={searchParams.get(param) ?? ''}
      onChange={(e) => update(param, e.target.value)}
      className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
