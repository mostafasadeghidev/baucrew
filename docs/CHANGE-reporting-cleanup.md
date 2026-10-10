# CHANGE: CRM becomes Auswertungen — four tabs, no working lists

## What changed

The projects are to become the working CRM (boards, automations); the page
that was called CRM only reads what the projects add up to. So:

- **Renamed** CRM → **Auswertungen** (EN: *Reporting*) in the menu, the page
  title and every text that named it. The address stays `/reports`.
- **Heute removed.** Its tiles and sheets (`today-view.tsx`, `tile-board.tsx`)
  are gone. **Vergleich** is now the tab without a name — the one the page
  opens on. Whoever may not see money is sent to Auslastung instead.
  Old addresses are redirected (`resolveReportsUrl`):

  | Old | New |
  | --- | --- |
  | `tab=compare` | `/reports` with the chart's choices (`compare`, `chart`, `qyear`, `qcompare`) |
  | no tab with `open=…` (a Heute sheet) or `view=…` | `/reports` (Vergleich) |
  | `tab=overview`, `tab=cockpit`, unknown tab | `/reports`, keeping `year`/`period` |
  | `tab=jobs`, `tab=pipeline`, `tab=offers` | `/reports`, keeping `year`/`period` |
  | `tab=revenue&layout=matrix` | `/reports?tab=revenue` without `layout`/`per` |

  Lost with Heute and not shown elsewhere: *Geld ausstehend* (finished but not
  invoiced / invoiced but not paid), the *Auftragsbestand* in weeks, today's
  crew against the usual one, and missing material by article. Their loaders
  (`getOpenMoney`, `getCrewDays`, `situationSummary`, `usualCrew`, …) are kept
  with their tests, so any of them can be given a new place.
- **Aufträge & Baustellen and Pipeline removed.** Both were working lists of
  the projects (late/running/starting sites; enquiry/offer/order columns with a
  status menu) and duplicated `/sites` and the project boards. Gone with them:
  `jobs-view.tsx`, `pipeline-view.tsx`, `src/lib/site-timeline.ts` (the eight-
  week timeline, shown nowhere else) and the loaders `getToday` and
  `getPipeline`. Kept: `src/lib/pipeline.ts` (days in a status, stale rules,
  the year's win rate — pure and tested; the basis for "days in this list" on
  board cards or an automation) and `src/lib/cockpit.ts`. The page has four
  tabs: Vergleich, Planumsatz, Auslastung, Datenlücken. The dashboard's offers
  card now links to the projects list narrowed to *Angebot erstellt*.
- **Datenlücken redrawn:** a tile per kind of gap with its count and the money
  it touches (`?gap=` narrows the list to one kind), then a full-width table per
  kind with proper columns instead of four boxes that scrolled on their own.
  New kind **Baustelle ohne Ort** (planned or running work without a town —
  no rain warning, no pin on the map): the check lived only in Aufträge &
  Baustellen and now counts in `dataGapReport` (`noTown`).
- **Year matrix removed** from Planumsatz (`revenue-matrix.tsx`, the `matrix`
  layout and its cell zoom, `heatLevel`). A cookie or link that names it opens
  the grid.
- **Planumsatz month cards redrawn:** the month's sum and a plan progress bar
  with the difference in the card's head; *Eigene Leute* and *SUB* as headed
  groups with their sums above their lines; a project line and a plan line
  without a project told apart by a filled or hollow dot rather than by colour;
  the running month framed. No subgrid any more.
- **Vergleich fixes:**
  - *Planumsatz je Jahr* follows the chosen period (Q1 against Q1), as the page
    says every figure does.
  - *Kumuliert* no longer compares against a previous year without figures
    (it showed 0 € and the whole year as gain); its sums are whole cents.
  - The chart tooltip's percentage was the chosen year's change against the
    compared year, but read as the other way round ("vs. 2026" beside 2025).
    The column is now headed *Veränderung 2026*, and the ⓘ says it.
- **Auslastung fixes** (`crewUsage`, one rule for ring, bars and rows):
  - The ring is the sum of the people listed under it (it used to count
    everybody booked in the whole year against every month).
  - Only the stretch the schedule is written for counts — first to last
    booked day — not whole months (a schedule begun on 27 July no longer
    holds the crew against all of July).
  - The period's month bars use the period's crew and add up to the ring; a
    month inside the schedule with nobody booked reads 0 %.
  - Every active vehicle has a row, an idle one at 0 %.
  - The intro no longer promises a list of finished jobs the tab never had.
  - The Excel sheet *Auslastung* uses the same figures (it counted raw
    schedule rows: two sites a day were two days, weekends counted);
    `getYearUsage` is gone.
- **Projects board:** the row of lists scrolls out to the edges of the
  board's ground; it used to be cut off along a line 12 px inside it on both
  sides (`kanban.tsx`: `-mx-3 pl-3` on the scroller and a spacer at its end).
- **Projects list:** the columns fit the card at 1440 px, and the status menu
  with its next step stays on one line. The due date on the project page lines
  up with the other values.

## Touched files

- `src/app/(admin)/reports/page.tsx` — tabs, loaders, Vergleich fixes, month cards
- `src/app/(admin)/reports/usage-view.tsx` — ring from the rows, date span in the head
- `src/app/(admin)/reports/gaps-view.tsx` — tiles and tables; `src/lib/data-gaps.ts` — `noTown`
- `src/app/(admin)/reports/export/route.ts` — Auslastung sheet from `getCrewUsage`
- `src/lib/reports-url.ts` — Vergleich as the default, new redirects
- `src/lib/revenue-layout.ts`, `src/components/revenue-layout-picker.tsx` — no matrix
- `src/lib/order-situation.ts` — `crewUsage` rewritten, `crewLoadByMonth` removed
- `src/lib/reports.ts` — `getCrewUsage` passes the fleet and returns the window; `getYearUsage` removed
- `src/lib/reports-calc.ts` — `cumulativeMonths` in cents; `heatLevel` removed
- `src/app/(admin)/dashboard/page.tsx` — offers link → projects list, *Angebot erstellt*
- `src/app/(admin)/projects/kanban.tsx` — the board's scroller reaches the ground's edges
- `src/app/(admin)/projects/page.tsx`, `src/app/(admin)/projects/[id]/project-detail.tsx` — list columns, due date
- `messages/de.json`, `messages/en.json` — rename, new keys; 110 keys of Heute, the matrix, the two working lists and the old Datenlücken markup removed
- `docs/BENUTZERHANDBUCH.md` — chapter 14 and every mention of the CRM
- Tests: `tests/unit/reports-url.test.ts`, `revenue-layout.test.ts`, `reports-calc.test.ts`, `order-situation.test.ts`, `data-gaps.test.ts`, `tests/db/reports.test.ts` (the town check runs through `getDataGaps`)
- Removed: `src/app/(admin)/reports/today-view.tsx`, `tile-board.tsx`, `revenue-matrix.tsx`, `jobs-view.tsx`, `pipeline-view.tsx`, `src/lib/site-timeline.ts`, `tests/unit/site-timeline.test.ts`

## Rollback

1. This change came in with the snapshot commit 639185d, which also carries
   the board-first projects, the UI overhaul, Wattro and the Trello import —
   do **not** revert that commit whole. Instead restore the files named under
   "Touched files" from the commit before it, 1.49.0 (`git checkout v1.49.0
   -- <file>` for each removed file; for the changed ones take the old
   reporting parts by hand, since the same files carry later work), together
   with the message keys and the tests listed there.
2. Nothing in the database changed; no migration to undo. A browser that saved
   the lanes or the grid keeps its choice; one that had saved the matrix opens
   the grid until it is chosen again.
