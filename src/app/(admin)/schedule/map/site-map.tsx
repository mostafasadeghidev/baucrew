'use client'

/**
 * The scheduling map: plain Leaflet over OpenStreetMap tiles — no account, no
 * API key. Markers are numbered `divIcon`s, so nothing depends on Leaflet's
 * own image assets, and each carries the colour of the day it belongs to: a
 * week's worth of sites is five to seven sets of pins on one map, and the
 * colour is the only thing that says which day a pin is for.
 *
 * Leaflet is fetched inside an effect rather than imported at the top. It
 * reaches for `window` while its module body runs, and a client component is
 * still evaluated on the server to render the first HTML — so a plain import
 * threw there on every request. The page came out anyway, drawn again on the
 * client, but each visit left a 500 behind it.
 *
 * The marker layer is rebuilt and the view refitted whenever `sites` changes,
 * so narrowing the map to a single day is just a shorter list.
 */

import { useEffect, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type MapSite = {
  id: string
  /** Number shown in the marker and in the list beside the map, per day. */
  index: number
  name: string
  address: string
  /** The day it belongs to, spelled out, for the popup. */
  dayLabel: string
  /** A CSS colour for the pin — one per weekday. */
  color: string
  lat: number
  lng: number
}

export function SiteMap({
  sites,
  ariaLabel,
  className = 'h-[420px] lg:h-[600px]',
}: {
  sites: MapSite[]
  ariaLabel: string
  /** How tall the map is. The week view hands it the height left on screen. */
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const markers = useRef<Leaflet.LayerGroup | null>(null)
  const [L, setL] = useState<typeof Leaflet | null>(null)

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
    // The wheel zooms the map; the page scrolls again as
    // soon as the pointer leaves the map.
    const instance = L.map(container.current, { scrollWheelZoom: true }).setView([51.1, 10.4], 6)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(instance)
    markers.current = L.layerGroup().addTo(instance)
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
      markers.current = null
    }
  }, [L])

  useEffect(() => {
    const instance = map.current
    const group = markers.current
    if (!L || !instance || !group) return
    group.clearLayers()
    if (sites.length === 0) return

    for (const site of sites) {
      const icon = L.divIcon({
        className: '',
        html: `<span style="background:${escapeHtml(site.color)}" class="flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-md">${site.index}</span>`,
        iconSize: [0, 0],
      })
      L.marker([site.lat, site.lng], { icon, title: `${site.dayLabel} · ${site.name}` })
        .bindPopup(
          `<strong>${escapeHtml(site.name)}</strong><br>${escapeHtml(site.dayLabel)}<br>${escapeHtml(site.address)}`
        )
        .addTo(group)
    }

    const bounds = L.latLngBounds(sites.map((s) => [s.lat, s.lng] as [number, number]))
    instance.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
    // Tiles can be laid out before the pane knows its size.
    instance.invalidateSize()
  }, [L, sites])

  // The map fills whatever room is left on the page, so its box changes with
  // the window. Leaflet lays its tiles out once and has to be told.
  useEffect(() => {
    const node = container.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => map.current?.invalidateSize())
    observer.observe(node)
    return () => observer.disconnect()
  }, [L])

  return (
    <div
      ref={container}
      role="application"
      aria-label={ariaLabel}
      className={`w-full overflow-hidden rounded-lg border border-border bg-subtle ${className}`}
    />
  )
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  )
}
