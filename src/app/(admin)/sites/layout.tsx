import type { ReactNode } from 'react'
import { PendingCardSheet } from '../projects/pending-card-sheet'

/**
 * Baustellen and, over it, the card opened from it — the projects page's
 * arrangement (projects/layout.tsx) in its second place: the card lives in
 * the `@modal` slot at `/sites/card/<id>`, streamed over the board, and
 * closing it returns to Baustellen.
 */
export default function SitesLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      {children}
      {modal}
      <PendingCardSheet />
    </>
  )
}
