/**
 * Trello's card templates at the foot of a list: what a template carries,
 * offered under "Behalten …" when a card is made from it, and what of that the
 * person kept. The description always goes with the card, as Trello's does;
 * the rest is ticked on and off, and only what the template has is offered.
 *
 * Pure, so the choice is tested without a board.
 */

/** The parts of a template, in the order "Behalten …" lists them; the trade is the card's label. */
export const TEMPLATE_PARTS = ['labels', 'members', 'checklists', 'vehicles', 'devices', 'items'] as const
export type TemplatePart = (typeof TEMPLATE_PARTS)[number]

/** How much of each part a template holds. */
export type TemplateCounts = Record<TemplatePart, number>

/** The parts a template has, each with how many — what "Behalten …" offers. */
export function templateParts(counts: TemplateCounts): Array<{ part: TemplatePart; count: number }> {
  return TEMPLATE_PARTS.filter((part) => counts[part] > 0).map((part) => ({ part, count: counts[part] }))
}

/** The parts ticked in the form; anything else it sent counts for nothing. */
export function keptParts(raw: ReadonlyArray<unknown>): Set<TemplatePart> {
  return new Set(TEMPLATE_PARTS.filter((part) => raw.includes(part)))
}
