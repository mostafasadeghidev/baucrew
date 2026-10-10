'use client'

/**
 * Where Wattro last placed a machine, drawn on the device's page: one pin on
 * OpenStreetMap through plain Leaflet, the same as the scheduling map — no
 * account, no key. Small and calm: the wheel scrolls the page, not the map
 * (a map in the middle of a page that swallows the wheel traps the reader);
 * the + and − buttons zoom.
 *
 * Leaflet is fetched inside an effect for the reason told in
 * schedule/map/site-map.tsx: its module reaches for `window` while it loads.
 */

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

export function DeviceMap({
  lat,
  lng,
  label,
  className = 'h-60',
}: {
  lat: number
  lng: number
  label: string
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    let remove: (() => void) | undefined
    import('leaflet').then((mod) => {
      const L = mod.default ?? mod
      if (!live || !container.current) return
      const map = L.map(container.current, { scrollWheelZoom: false, attributionControl: true }).setView([lat, lng], 16)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map)
      // A drawn pin rather than Leaflet's image marker: nothing depends on
      // Leaflet's own image files being served.
      const icon = L.divIcon({
        className: '',
        html: '<span class="block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--accent)] shadow-md"></span>',
        iconSize: [0, 0],
      })
      L.marker([lat, lng], { icon, title: label, keyboard: false }).addTo(map)
      // Tiles can be laid out before the card knows its width.
      requestAnimationFrame(() => map.invalidateSize())
      remove = () => map.remove()
    })
    return () => {
      live = false
      remove?.()
    }
  }, [lat, lng, label])

  return <div ref={container} role="img" aria-label={label} className={`relative z-0 w-full ${className}`} />
}
