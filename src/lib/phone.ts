/**
 * A phone number as a link a device can dial: `tel:` and nothing but digits
 * and a leading plus. On a phone it opens the dialler; on the office's PC it
 * hands the number to whatever answers `tel:` there — the softphone of the
 * telephone system, in most offices — which is how a click in the customer
 * list becomes a call without the two systems knowing of each other.
 *
 * Null for what is not a number: "siehe Notiz", or too few digits to dial.
 */
export function telHref(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const digits = trimmed.replace(/[^\d]/g, '')
  if (digits.length < 3) return null
  const plus = trimmed.startsWith('+') ? '+' : ''
  return `tel:${plus}${digits}`
}
