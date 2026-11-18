import { CardSheet } from '../../../../projects/card-sheet'
import { CardSheetPending } from '../../../../projects/pending-card-sheet'

/** The sheet's frame while the card streams in, as over the projects page. */
export default function Loading() {
  return (
    <CardSheet>
      <CardSheetPending />
    </CardSheet>
  )
}
