'use client'

/**
 * What this browser remembers about the board, the way Trello remembers it
 * per person: whether the cards show their details or only what a Trello
 * card shows, and which lists are folded to a strip. Kept in the browser's
 * storage — it is a way of looking, not a fact about the projects — and read
 * through useSyncExternalStore so every part of the board flips together.
 */

import { useSyncExternalStore } from 'react'

const EVENT = 'baucrew:board-pref'

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(EVENT, onChange)
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* private mode: the choice holds for this visit only */
  }
  window.dispatchEvent(new Event(EVENT))
}

/**
 * Whether the labels are opened — pills with names, which is how the board
 * opens — or bars without, the way Trello folds them. A click on any label
 * flips every one of them.
 */
export const LABELS_KEY = 'baucrew-board-labels'

export function useLabelsOpen(): [boolean, () => void] {
  const open = useSyncExternalStore(subscribe, () => read(LABELS_KEY) !== '0', () => true)
  return [open, () => write(LABELS_KEY, open ? '0' : '1')]
}

/** Whether the cards show everything (customer, place, number, value) or what a Trello card shows. */
export const DETAILS_KEY = 'baucrew-board-details'

export function useCardDetails(): [boolean, () => void] {
  const on = useSyncExternalStore(subscribe, () => read(DETAILS_KEY) === '1', () => false)
  return [on, () => write(DETAILS_KEY, on ? '0' : '1')]
}

/** The lists folded to a strip on one board. */
export function useCollapsedColumns(boardId: string): [string[], (status: string) => void] {
  const key = `baucrew-board-collapsed:${boardId}`
  const raw = useSyncExternalStore(subscribe, () => read(key) ?? '[]', () => '[]')
  let list: string[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) list = parsed.filter((s): s is string => typeof s === 'string')
  } catch {
    list = []
  }
  const toggle = (status: string) =>
    write(key, JSON.stringify(list.includes(status) ? list.filter((s) => s !== status) : [...list, status]))
  return [list, toggle]
}
