'use client'

/**
 * Taking photos on the site: the phone's camera ("Foto aufnehmen", offered
 * only on a device held in the hand) or its gallery, several at once. One
 * hook for every place that asks for photos — the documentation, a task — so
 * they behave alike; the photos are drawn smaller before they leave
 * (`downscaleImage` in src/lib/photo-upload.ts), by whoever sends them.
 */

import { useRef, useSyncExternalStore, type ReactNode } from 'react'

/** Whether the device is held in the hand: the camera is offered as a way of its own only there. */
export function useTouch(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia('(pointer: coarse)')
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => window.matchMedia('(pointer: coarse)').matches,
    () => false
  )
}

/**
 * The two hidden pickers and the ways to open them. `inputs` goes somewhere
 * in the page; `openCamera`/`openGallery` are called from any button or menu.
 */
export function usePhotoPicker(onFiles: (files: File[]) => void): {
  inputs: ReactNode
  openCamera: () => void
  openGallery: () => void
  touch: boolean
} {
  const touch = useTouch()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const take = (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? [])
    // Emptied at once, so the same photo can be picked again.
    input.value = ''
    if (files.length > 0) onFiles(files)
  }
  const inputs = (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => take(e.currentTarget)}
      />
      <input ref={gallery} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => take(e.currentTarget)} />
    </>
  )
  return { inputs, openCamera: () => camera.current?.click(), openGallery: () => gallery.current?.click(), touch }
}
