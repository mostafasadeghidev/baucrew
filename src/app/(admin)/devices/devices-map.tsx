'use client'

/**
 * All devices on one map: a list of the spots beside it, a numbered pin per
 * spot. Plain Leaflet over OpenStreetMap tiles, as on the scheduling map — no
 * account, no key; fetched inside an effect because Leaflet's module reaches
 * for `window` while it loads (see schedule/map/site-map.tsx).
 *
 * The position is where Wattro last saw a machine — mostly where it was
 * scanned — so a spot gathers what was scanned there. Clicking a spot in the
 * list brings the map to it and opens its bubble; the bubble and the list
 * both lead to the machines.
 */

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import 'leaflet/dist/leaflet.css'
import { PLACE_COLOURS } from './wattro-where'

export type MapSpot = {
  key: string
  index: number
  lat: number
  lng: number
  kind: 'store' | 'employee' | 'project'
  label: string
  devices: Array<{ id: string; name: string; meta: string }>
}

/** The place kinds' colours, as on their icons and in the tabs. */
const PIN = PLACE_COLOURS

/** How many machines a bubble names before it says "and n more". */
const BUBBLE_DEVICES = 8

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function DevicesMap({
  spots,
  unplaced,
  emptyLabel,
}: {
  spots: MapSpot[]
  /** Machines Wattro has no position for — listed, not pinned. */
  unplaced: Array<{ id: string; name: string; meta: string }>
  /** "Nothing found" or "nothing here", as the page knows which. */
  emptyLabel: string
}) {
  const t = useTranslations('devices')
  const labels = {
    map: t('mapTitle'),
    devices: (count: number) => t('mapDevices', { count }),
    more: (count: number) => t('mapMore', { count }),
    unplaced: t('mapUnplaced'),
    hint: t('mapHint'),
    empty: emptyLabel,
  }
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const pins = useRef(new Map<string, Leaflet.Marker>())
  /** Every spot in view — kept so a change of size can bring them all back. */
  const bounds = useRef<Leaflet.LatLngBounds | null>(null)
  /** Once someone drags the map or picks a spot, a resize leaves their view alone. */
  const moved = useRef(false)
  const [L, setL] = useState<typeof Leaflet | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    import('leaflet').then((mod) => {
      if (live) setL(mod.default ?? mod)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!L || !container.current || map.current) return
    // The wheel zooms here: the map is the page's subject in this view.
    const instance = L.map(container.current, { scrollWheelZoom: true }).setView([51.1, 10.4], 6)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(instance)
    map.current = instance
    instance.on('dragstart', () => {
      moved.current = true
    })
    // The box takes its size after the map is made (and again with the
    // window): measure, and while nobody has moved the map, fit every spot
    // in again — fitted to a box of another size, the pins sat off-screen.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            instance.invalidateSize()
            if (!moved.current && bounds.current) instance.fitBounds(bounds.current, { padding: [40, 40], maxZoom: 15 })
          })
    observer?.observe(container.current)
    return () => {
      observer?.disconnect()
      instance.remove()
      map.current = null
    }
  }, [L])

  useEffect(() => {
    const instance = map.current
    if (!L || !instance) return
    const layer = L.layerGroup().addTo(instance)
    pins.current.clear()
    for (const spot of spots) {
      const count = spot.devices.length
      // A drawn pin, not Leaflet's image marker: its number is the list's
      // number, its colour the kind of place most of its machines belong to.
      const size = count >= 100 ? 36 : count >= 10 ? 30 : 26
      const icon = L.divIcon({
        className: '',
        html: `<span style="background:${PIN[spot.kind]};width:${size}px;height:${size}px" class="flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-md">${spot.index}</span>`,
        iconSize: [0, 0],
      })
      const names = spot.devices
        .slice(0, BUBBLE_DEVICES)
        .map((d) => `<a href="/devices/${encodeURIComponent(d.id)}" style="display:block">${escapeHtml(d.name)}</a>`)
        .join('')
      const more = count > BUBBLE_DEVICES ? `<div style="opacity:.7">${escapeHtml(labels.more(count - BUBBLE_DEVICES))}</div>` : ''
      const marker = L.marker([spot.lat, spot.lng], { icon, title: `${spot.index} · ${spot.label} · ${labels.devices(count)}` })
        .bindPopup(`<strong>${escapeHtml(spot.label)}</strong><br><span style="opacity:.7">${escapeHtml(labels.devices(count))}</span><div style="margin-top:4px">${names}${more}</div>`, {
          autoPan: true,
          autoPanPadding: [24, 24],
        })
        .addTo(layer)
      pins.current.set(spot.key, marker)
    }
    instance.invalidateSize()
    bounds.current = spots.length > 0 ? L.latLngBounds(spots.map((s) => [s.lat, s.lng] as [number, number])) : null
    moved.current = false
    if (bounds.current) instance.fitBounds(bounds.current, { padding: [40, 40], maxZoom: 15 })
    return () => {
      layer.remove()
    }
    // The labels are read fresh above on every render; the pins follow the spots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L, spots])

  function focus(spot: MapSpot) {
    setOpen((current) => (current === spot.key ? null : spot.key))
    const instance = map.current
    const marker = pins.current.get(spot.key)
    if (!instance || !marker) return
    moved.current = true
    // The bubble waits for the map to arrive, or it opens over the edge.
    instance.once('moveend', () => marker.openPopup())
    instance.flyTo([spot.lat, spot.lng], Math.max(instance.getZoom(), 16), { duration: 0.6 })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="order-2 flex max-h-[calc(100dvh-13rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface lg:order-1">
        <p className="shrink-0 border-b border-border px-4 py-2.5 text-xs text-muted">{labels.hint}</p>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto text-sm">
          {spots.length === 0 && <li className="px-4 py-6 text-center text-muted">{labels.empty}</li>}
          {spots.map((spot) => (
            <li key={spot.key}>
              <button
                type="button"
                onClick={() => focus(spot)}
                aria-expanded={open === spot.key}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  style={{ background: PIN[spot.kind] }}
                  className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white"
                >
                  {spot.index}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{spot.label}</span>
                  <span className="block text-xs text-muted">{labels.devices(spot.devices.length)}</span>
                </span>
                <ChevronRight
                  aria-hidden
                  className={`h-4 w-4 shrink-0 text-muted transition-transform ${open === spot.key ? 'rotate-90' : ''}`}
                />
              </button>
              {open === spot.key && (
                <ul className="pb-2 pl-12 pr-4">
                  {spot.devices.map((device) => (
                    <li key={device.id} className="flex items-baseline gap-2 py-0.5">
                      <Link href={`/devices/${device.id}`} className="min-w-0 truncate text-accent hover:underline">
                        {device.name}
                      </Link>
                      {device.meta && <span className="shrink-0 text-xs tabular-nums text-muted">{device.meta}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {unplaced.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setOpen((current) => (current === 'unplaced' ? null : 'unplaced'))}
                aria-expanded={open === 'unplaced'}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-muted hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span aria-hidden className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{labels.unplaced}</span>
                  <span className="block text-xs">{labels.devices(unplaced.length)}</span>
                </span>
                <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 transition-transform ${open === 'unplaced' ? 'rotate-90' : ''}`} />
              </button>
              {open === 'unplaced' && (
                <ul className="pb-2 pl-12 pr-4">
                  {unplaced.map((device) => (
                    <li key={device.id} className="flex items-baseline gap-2 py-0.5">
                      <Link href={`/devices/${device.id}`} className="min-w-0 truncate text-accent hover:underline">
                        {device.name}
                      </Link>
                      {device.meta && <span className="shrink-0 text-xs tabular-nums text-muted">{device.meta}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
        </ul>
      </div>

      <div className="order-1 overflow-hidden rounded-xl border border-border lg:order-2">
        <div ref={container} role="region" aria-label={labels.map} className="relative z-0 h-[420px] w-full lg:h-[calc(100dvh-13rem)]" />
      </div>
    </div>
  )
}
