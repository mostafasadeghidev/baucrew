/**
 * Whether the week board shows Saturday and Sunday.
 *
 * They are shown unless the office switched them off: a week board that hides
 * two days by default is a board where Saturday work is planned on a Friday by
 * mistake. The choice travels in the address — nothing for "on", `weekend=0`
 * for "off" — so a link to the schedule from anywhere opens with the weekend.
 * A week with an assignment on a weekend day shows it whatever the switch says.
 *
 * Pure, so the rule is tested without a request.
 */

/** The address value that switches the weekend columns off. */
export const WEEKEND_OFF = '0'

export function showsWeekend(param: string | undefined, hasWeekendEntries: boolean): boolean {
  return hasWeekendEntries || param !== WEEKEND_OFF
}

/** The address value for a choice: null (leave it out) for on, `0` for off. */
export function weekendParam(show: boolean): string | null {
  return show ? null : WEEKEND_OFF
}

/**
 * What a link to another scheduling view carries of the choice: `&weekend=0`
 * when the office switched the weekend off, nothing otherwise. The month and
 * the map have no weekend switch of their own, but a trip through them must
 * not bring the week board back with a weekend nobody asked for.
 */
export function weekendSuffix(param: string | undefined): string {
  return param === WEEKEND_OFF ? `&weekend=${WEEKEND_OFF}` : ''
}
