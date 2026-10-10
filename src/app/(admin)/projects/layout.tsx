import type { ReactNode } from 'react'
import { PendingCardSheet } from './pending-card-sheet'

/**
 * The projects page and, over it, the card opened from it. The card lives in
 * the `@modal` slot at its own address (`/projects/card/<id>`): opening and
 * closing one streams the card in and out while the board or the list
 * underneath stays as it is — the way a Trello card opens over its board.
 * The pending frame draws the sheet's skeleton on the click itself, for the
 * moment before the card's route answers.
 */
export default function ProjectsLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      {children}
      {modal}
      <PendingCardSheet />
    </>
  )
}
