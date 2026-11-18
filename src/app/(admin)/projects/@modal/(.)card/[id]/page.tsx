import { CardModal } from '../../../card-modal'

/** A card opened over the projects page: the sheet, the board staying put (card-modal.tsx). */
export default function CardModalPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <CardModal {...props} />
}
