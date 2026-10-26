# CHANGE: The client's project number as a field of its own

## What changed

The client numbers his jobs himself: the number in brackets behind every
Trello card's title, "Muster (1234567)". The Trello import took it out of the
title and kept it only as the project's external id, where the card could show
it small under the name but nobody could type it in, change it, or search it
as a field — and a project made in the app could not get one at all.

It is now a field of its own, **Projektnummer** (`Project.jobNumber`):

- **Typed in or left empty** on the new-project form, **editable** on the edit
  form and the card sheet (basic data card). Empty means "no number". A number
  another project already has is refused ("Diese Projektnummer hat schon ein
  anderes Projekt."): the column is unique.
- **Shown** under a card's name on the board (as before) and now also in the
  title of the full project page, small and copyable. The board search finds
  it (it used to match only digits against the Trello external id).
- **Existing numbers copied by the migration** `20261019140000_project_job_number`:
  every Trello project whose external id is five to nine digits gets it as its
  Projektnummer, unless the same number stands on two projects (then neither
  gets it; those are for a person to sort out). Projects whose card had no
  number, and projects from elsewhere, stay empty. Numbers that were left in a
  project's *name* (a few dozen older cards) are not touched.
- **The Trello import fills it in, never overwrites it**: a new project takes
  the title's number; an existing project takes it only while it has none. A
  number somebody corrected in the app stays, and a number another project
  already holds is not taken twice.
- **The app's own number is unchanged.** `Project.number` ("2026-0048") stays
  what it was — the one the API, the webhooks and the automations know a
  project by — so nothing outside the app can break. Webhook bodies carry
  `jobNumber` as an additional field.
- **Wattro**: a project's ID there is its Projektnummer when it has one, the
  app's own number otherwise (`wattroKeyOf`). Changing the number here renames
  the same project in Wattro, found by the Wattro id the link keeps — it is not
  made a second time. See `docs/CHANGE-wattro-project-push.md`.
- Every change of the number is in the audit log (`project.jobNumber`, old and
  new value).
- The label "Auftragsnr." / "Job no." became "Projektnr." / "Project no." to
  match what the client calls it.

Not done: a project made through the API (`/api/v1`) cannot set the number
yet; the import from Excel does not read one.

## Touched files

- `prisma/schema.prisma`, `prisma/migrations/20261019140000_project_job_number/`
- `src/lib/job-number.ts` (field helpers, `wattroKeyOf`)
- `src/app/(admin)/projects/actions.ts`, `project-form.tsx`, `new/page.tsx`,
  `[id]/edit/page.tsx`, `[id]/project-detail.tsx`, `page.tsx`
- `src/lib/trello/import.ts`, `src/lib/project-events.ts`
- `src/lib/wattro/projects.ts`, `project-push.ts`, `client.ts`
- `messages/de.json`, `messages/en.json`
- Tests: `tests/unit/job-number.test.ts`, `wattro-projects.test.ts`,
  `wattro-project-push.test.ts`, `tests/db/trello-import.test.ts`

## Rollback

Revert the commit and drop the column with a migration:
`DROP INDEX "Project_jobNumber_key"; ALTER TABLE "Project" DROP COLUMN "jobNumber";`
Nothing else read the column; the numbers still stand in the external ids
they were copied from. Projects already renamed in Wattro keep their new
number there.
