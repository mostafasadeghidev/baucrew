import { CardSheet } from '../../../card-sheet'
import { CardSheetPending } from '../../../pending-card-sheet'

/**
 * The sheet's frame while the card streams in: it shows with the route's
 * first reply, so a click gives at once the white card over the dimmed board
 * with its cross — the content arrives a moment later. The same picture the
 * pending frame draws on the click itself.
 */
export default function Loading() {
  return (
    <CardSheet>
      <CardSheetPending />
    </CardSheet>
  )
}
