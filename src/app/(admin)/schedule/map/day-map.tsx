'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type MapSite = {
  id: string
  /** Number shown in the marker and in the list beside the map. */
  index: number
  name: string
  address: string
  lat: number
  lng: number
}

/**
 * Day map with plain Leaflet and OpenStreetMap tiles — no account, no API key.
 * Markers are numbered divIcons so we never depend on Leaflet's image assets.
 */
export function DayMap({ sites, ariaLabel }: { sites: MapSite[]; ariaLabel: string }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!container.current || map.current) return
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([51.1, 10.4], 6)
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
  }, [])

  useEffect(() => {
    const instance = map.current
    const group = markers.current
    if (!instance || !group) return
    group.clearLayers()
    if (sites.length === 0) return

    for (const site of sites) {
      const icon = L.divIcon({
        className: '',
        html: `<span class="flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[var(--accent)] text-xs font-semibold text-white shadow-md">${site.index}</span>`,
        iconSize: [0, 0],
      })
      L.marker([site.lat, site.lng], { icon, title: site.name })
        .bindPopup(
          `<strong>${escapeHtml(site.name)}</strong><br>${escapeHtml(site.address)}`
        )
        .addTo(group)
    }

    const bounds = L.latLngBounds(sites.map((s) => [s.lat, s.lng] as [number, number]))
    instance.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
    // Tiles can be laid out before the pane knows its size.
    instance.invalidateSize()
  }, [sites])

  return (
    <div
      ref={container}
      role="application"
      aria-label={ariaLabel}
      className="h-[420px] w-full overflow-hidden rounded-lg border border-border bg-subtle lg:h-[600px]"
    />
  )
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  )
}
