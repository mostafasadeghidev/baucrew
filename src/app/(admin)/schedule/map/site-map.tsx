'use client'

/**
 * The scheduling map: plain Leaflet over OpenStreetMap tiles — no account, no
 * API key. Markers are numbered `divIcon`s, so nothing depends on Leaflet's
 * own image assets, and each carries the colour of the site it stands for —
 * one pin per place, however many days that place is worked. The days it is
 * worked are in the popup.
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

/**
 * The list beside the map asks the map to show a site. It travels as a DOM
 * event rather than through the URL: opening a bubble is not somewhere you
 * navigate to, and a round trip to the server to open one would be felt.
 */
export const FOCUS_SITE_EVENT = 'baucrew:focus-site'

export type MapSite = {
  id: string
  /** Number shown in the marker and in the list beside the map, per day. */
  index: number
  name: string
  address: string
  /** The days this site is planned for, spelled out, for the popup. */
  days: string[]
  /** A CSS colour for the pin — one per site. */
  color: string
  /** True when this pin was moved off a place it shares with another site. */
  spread?: boolean
  lat: number
  lng: number
}

export function SiteMap({
  sites,
  ariaLabel,
  sharedPlaceNote,
  className = 'h-[420px] lg:h-[600px]',
}: {
  sites: MapSite[]
  ariaLabel: string
  /** Added to the bubble of a pin that had to be moved off a shared place. */
  sharedPlaceNote?: string
  /** How tall the map is. The week view hands it the height left on screen. */
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const markers = useRef<Leaflet.LayerGroup | null>(null)
  const bySite = useRef(new Map<string, Leaflet.Marker>())
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
    bySite.current.clear()
    if (sites.length === 0) return

    for (const site of sites) {
      const icon = L.divIcon({
        className: '',
        html: `<span style="background:${escapeHtml(site.color)}" class="flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-md">${site.index}</span>`,
        iconSize: [0, 0],
      })
      const days = site.days.join(' · ')
      const note =
        site.spread && sharedPlaceNote ? `<br><em>${escapeHtml(sharedPlaceNote)}</em>` : ''
      const marker = L.marker([site.lat, site.lng], { icon, title: `${site.name} · ${days}` })
        .bindPopup(
          `<strong>${escapeHtml(site.name)}</strong><br>${escapeHtml(site.address)}<br>${escapeHtml(days)}${note}`,
          // A bubble opened at the edge of the pane is a bubble half read.
          { autoPan: true, autoPanPadding: [24, 24] }
        )
        .addTo(group)
      bySite.current.set(site.id, marker)
    }

    const bounds = L.latLngBounds(sites.map((s) => [s.lat, s.lng] as [number, number]))
    instance.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
    // Tiles can be laid out before the pane knows its size.
    instance.invalidateSize()
  }, [L, sites, sharedPlaceNote])

  // The map fills whatever room is left on the page, so its box changes with
  // the window. Leaflet lays its tiles out once and has to be told.
  useEffect(() => {
    const node = container.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => map.current?.invalidateSize())
    observer.observe(node)
    return () => observer.disconnect()
  }, [L])

  // Clicking a number in the list beside the map is the same as clicking the
  // pin: the map comes to it and its bubble opens.
  useEffect(() => {
    const onFocus = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      const marker = bySite.current.get(id)
      const instance = map.current
      if (!marker || !instance) return
      const here = marker.getLatLng()
      const centre: [number, number] = [here.lat, here.lng]
      // Close enough that a town fills the pane, which is where the pins of
      // one town come apart.
      const zoom = Math.max(instance.getZoom(), 14)
      // The bubble waits for the map to arrive: opened mid-flight, it works
      // out where to sit from a position the map is about to leave, and ends
      // up hanging over the edge of the pane.
      const open = () => marker.openPopup()
      const settled = instance.getZoom() === zoom && instance.getCenter().distanceTo(centre) < 1
      if (settled) open()
      else {
        instance.once('moveend', open)
        instance.setView(centre, zoom, { animate: true })
      }
    }
    window.addEventListener(FOCUS_SITE_EVENT, onFocus)
    return () => window.removeEventListener(FOCUS_SITE_EVENT, onFocus)
  }, [])

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
