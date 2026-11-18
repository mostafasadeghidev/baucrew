/**
 * The page of the record a tool changed, for the link under the assistant's
 * answer: the output's own `url`, its project's, or the project it names.
 * Only a path inside the app counts — never an address somewhere else.
 *
 * Pure and free of server imports, so the chat panel uses it as it is.
 */
export function recordUrl(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null
  const o = output as Record<string, unknown>
  const local = (v: unknown) => (typeof v === 'string' && /^\/[a-z]/.test(v) ? v : null)
  return (
    local(o.url) ??
    (o.project && typeof o.project === 'object' ? local((o.project as Record<string, unknown>).url) : null) ??
    (typeof o.projectId === 'string' && /^[\w-]+$/.test(o.projectId) ? `/projects/${o.projectId}` : null)
  )
}
