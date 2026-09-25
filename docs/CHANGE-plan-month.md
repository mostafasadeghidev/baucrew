# Change: the month a job stands in is the project's own

Date: 2026-09-25 · after release 1.42.0

## What changed

Until now the "Planumsatz" of a year with an imported planning sheet **was the
sheet**: every line of it stood in its month with its amount, tied to a project
or not, and a project the sheet did not know stood beside the month as "Nicht
in der Tabelle", uncounted. A job made in BauCrew never counted in such a year
until somebody gave it a line — which is what the client ran into on the test
site (QA of 23.09, item 2). The stand-in of 85dd626 ("Zeile anlegen") is
replaced by this change.

Now the month is the project's own:

- Two fields on a project: **`planMonth`** (a month's first day, UTC) — the
  month the work is expected in, the office's rough placing before a day is
  fixed — and **`planMonths`** (default 1) — how many months it runs when no
  end is fixed. A **fixed planned start wins** over the placing; with a planned
  end the job runs over every month between. Its order value is spread evenly
  over those months, cents-exact, the odd cents on the last month
  (`src/lib/plan-month.ts`, tested).
- `getYearRevenue` builds **every year the same way**: the projects in the
  months they run in, plus the sheet's lines that no project has taken over yet
  (and lines whose project was cancelled). A line tied to a project no longer
  counts — the project does. `MonthRevenue.extra`/`extraTotal` are gone;
  `sheetLed` now only says "sheet lines stand in the months too".
- The month cards and the lanes of the Planumsatz take a **dragged project**
  (`month-drag.tsx`, `month-actions.ts` → `moveProjectMonth`): fixed days shift
  by whole months (the 15th stays the 15th), the placing follows; the change is
  audited (`project.update`, field `planMonth`) and announced as
  `project.updated`. The matrix does not drag; a sheet line is never dragged.
- The project form has the two fields under the dates; the board card and the
  list show the month where no day is fixed; the card back's dates say it too.
- The board rule "Aufträge für <next year>" reads the first month (fixed start,
  else placing) and, on a drop, writes the placing — January next year — not a
  fixed day.
- Datenlücken: the card "Nicht in der Jahresplanung" is gone (nothing can be
  missing from the sheet any more); "Termin fehlt" is satisfied by a placing.
  The Heute tile counts the same.
- The "Plan" line on a month card (the sheet's sum against the projects') is
  shown in every year that has a sheet, not only in years without one.
- API: project bodies carry `planMonth` (first day) and `planMonths`; create
  and PATCH accept `planMonth` ("YYYY-MM" or a day of it) and `planMonths`;
  the revenue report says `source: "projects"` and `sheetLines`; `notInSheet`
  is gone. Webhook snapshots and `project.updated` changes include both fields.
- Removed with the stand-in: `src/lib/plan-lines.ts` (+ test),
  `reports/plan/create-line-button.tsx`, `createPlanLine`, the "Projekte ohne
  Zeile" section of the Planabgleich, the re-import's stand-in handling, and
  the messages that went with them.

## Migration

`prisma/migrations/20260925090000_plan_month`: adds the two columns and
back-fills them for every project tied to sheet lines — `planMonth` from the
earliest line's month, `planMonths` from the run of months to the latest — so
the months read as before where nobody has moved a job. (A project with a
fixed start keeps standing in the start's month; the back-fill only matters
where none is fixed.)

## Files

- `prisma/schema.prisma`, the migration above
- `src/lib/plan-month.ts` (new), `tests/unit/plan-month.test.ts` (new)
- `src/lib/reports.ts` (`getYearRevenue`, `getOpenOffers`, `getDataGaps`),
  `src/lib/data-gaps.ts` (+ test), `src/lib/order-situation.ts`,
  `src/lib/board-rules.ts` (+ test), `src/lib/project-years.ts`,
  `src/lib/webhook-events.ts` (+ test), `src/lib/project-events.ts`,
  `src/lib/api-service.ts`, `src/lib/card-history.ts`
- `src/app/(admin)/reports/page.tsx`, `revenue-lanes.tsx`,
  `revenue-matrix.tsx`, `gaps-view.tsx`, `today-view.tsx`, `export/route.ts`,
  `month-actions.ts` (new), `month-drag.tsx` (new), `plan/page.tsx`,
  `plan/actions.ts`
- `src/app/(admin)/settings/import-plan/actions.ts`
- `src/app/(admin)/projects/actions.ts`, `project-form.tsx`, `page.tsx`,
  `new/page.tsx`, `[id]/edit/page.tsx`, `[id]/project-detail.tsx`
- `tests/db/reports.test.ts`
- `messages/de.json`, `messages/en.json`; `docs/BENUTZERHANDBUCH.md`,
  `docs/API.md`, `AGENTS.md`

## Rollback

1. `git revert` the commit (or check out the state before it).
2. The database columns may stay — nothing reads them then — or go:

   ```sql
   ALTER TABLE "Project" DROP COLUMN "planMonth", DROP COLUMN "planMonths";
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20260925090000_plan_month';
   ```

   Nothing else was written by the migration. Jobs the office dragged between
   months keep the planned dates the drag gave them; the old code reads those
   as it always did.
