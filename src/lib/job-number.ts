/**
 * The office's own job number — the one in brackets behind a Trello card's
 * title ("Musterhof (4100001)"). The import takes it out of the title and
 * keeps it as the project's external id (src/lib/trello.ts, extractJobNumber);
 * this gives it back for the card to show. Null for a project that came from
 * elsewhere, and for a card that had no number, whose external id is then the
 * Trello card id itself.
 */
export function jobNumberOf(project: { externalSystem: string | null; externalId: string | null }): string | null {
  if (project.externalSystem !== 'trello' || !project.externalId) return null
  return /^\d{5,9}$/.test(project.externalId) ? project.externalId : null
}
