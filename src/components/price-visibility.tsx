'use client'

/**
 * Hiding prices, for the parts of a page drawn in the browser: charts, tables
 * that sort and filter. The server reads the same cookie for everything it
 * draws itself (`pricesHidden`), and the admin layout hands its answer down
 * here, so both halves of a page always agree.
 */

import { createContext, useContext, useOptimistic, useTransition, type ReactNode } from 'react'
import { setPricesHidden } from '@/app/actions'

const PricesHidden = createContext(false)

export function PricesHiddenProvider({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  return <PricesHidden.Provider value={hidden}>{children}</PricesHidden.Provider>
}

/** True while prices are to be shown as asterisks. */
export function usePricesHidden(): boolean {
  return useContext(PricesHidden)
}

/**
 * The switch in the user menu. It moves at once; the page follows as soon as
 * the server has drawn it again with the new setting.
 */
export function HidePricesToggle({ label }: { label: string }) {
  const hidden = usePricesHidden()
  const [shown, setShown] = useOptimistic(hidden)
  const [pending, startTransition] = useTransition()
  const flip = () =>
    startTransition(async () => {
      setShown(!shown)
      await setPricesHidden(!shown)
    })
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={label}
      title={label}
      onClick={flip}
      disabled={pending}
      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${
        shown ? 'border-accent bg-accent' : 'border-border bg-subtle'
      }`}
    >
      <span
        aria-hidden
        className={`h-3.5 w-3.5 rounded-full shadow-sm transition-transform ${
          shown ? 'translate-x-[1.05rem] bg-white' : 'translate-x-0.5 bg-muted'
        }`}
      />
    </button>
  )
}
