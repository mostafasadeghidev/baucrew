/**
 * The rules for what the contact card on an employee's page shows: phone,
 * e-mail, skills and notes.
 *
 * They lived inside the employee form's schema. The contact card now saves
 * these four on their own — without the name and the active flag, which only
 * the full edit page changes — so the rules move here and both the card and
 * the full form use the same ones: a phone number the card accepts is a phone
 * number the form accepts.
 *
 * Pure, so the rules are tested without a database or a request.
 */
import { z } from 'zod'

/** Trimmed and capped; left blank, it is stored as nothing rather than as "". */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : null))

export const contactSchema = z.object({
  phone: optionalText(300),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    .transform((v) => (v ? v : null)),
  /**
   * Comma-separated — the Latin comma or the Arabic one (U+060C), which a
   * keyboard set to Persian types. Written as an escape so the source stays in
   * one script.
   */
  skills: z
    .string()
    .trim()
    .max(1000)
    .transform((v) =>
      v
        .split(/[,\u060C]/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  notes: optionalText(5000),
})

export type EmployeeContact = z.infer<typeof contactSchema>

/** Reads the four fields from a submitted form; a field that is missing counts as blank. */
export function parseEmployeeContact(get: (name: string) => FormDataEntryValue | null) {
  return contactSchema.safeParse({
    phone: get('phone') ?? '',
    email: get('email') ?? '',
    skills: get('skills') ?? '',
    notes: get('notes') ?? '',
  })
}
