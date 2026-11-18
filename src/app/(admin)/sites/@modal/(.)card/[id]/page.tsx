import { CardModal } from '../../../../projects/card-modal'

/** A card opened over Baustellen: the projects page's sheet, the board staying put, a save returning here. */
export default function SitesCardModalPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <CardModal {...props} base="/sites" />
}
