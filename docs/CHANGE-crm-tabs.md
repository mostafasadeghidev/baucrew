# CHANGE: CRM page — eight tabs become six

## What changed

The CRM page (`/reports`) had eight tabs — Übersicht, Cockpit, Umsatz,
Angebote, Projekte, Kunden, Auslastung, Datenqualität. They showed the same
jobs through different groupings and different time rules, so one status could
carry two sums on one screen, and the year/period pickers only half-applied on
most tabs. It now has six tabs, each answering one question with one time rule:

| Tab | Question | Time rule |
| --- | --- | --- |
| **Heute** (default) | Where must I look today? Eight tiles with traffic lights; a click on a tile opens its short version right under the tiles (`?open=<tile>`), with a link to the whole of it. | Stand heute — pickers hidden |
| **Vergleich** (`tab=compare`) | How does the year compare with other years? Chart by month, quarter card, year bars, running sum. | Every figure follows Jahr/Zeitraum |
| **Aufträge & Baustellen** (`tab=jobs`) | The long lists behind the tiles: jobs by stage (`?open=offers\|ordered\|money` unfolds rows), the sites as cards in groups or as a kanban with a column per group (`?sites=kanban`), material. | Stand heute — pickers hidden |
| **Planumsatz** (`tab=revenue`) | What is the year/period worth by month, how sure is it, who carries it? Views: Monate · Baustellen · Kunden. | Every figure follows Jahr/Zeitraum |
| **Auslastung** (`tab=utilization`) | Is the crew planned, who and what is idle, how long did finished jobs take? | Every figure follows Jahr/Zeitraum |
| **Datenlücken** (`tab=quality`) | What makes a figure wrong or incomplete, and where is it fixed? | Stand heute |

Rules that hold on every tab:

- **Planumsatz** is money by month (`getYearRevenue`), **Auftragswert** is
  money by job (`orderValue`, price + Nachträge). Every figure is named as one
  of the two.
- **Altbestand** (work finished before the history cutoff) stays in Planumsatz
  totals but never appears in a lamp or a to-do list; where it is left out, a
  footnote counts it.
- One concept, one loader: the Datenlücken count on the Heute tile, the tab
  badge and the Planumsatz signpost is the same number (`dataGapReport`).
- Lamps are the only summary layer; every tile links to what it counts.

The comparison chart, quarter card, year bars and the running sum moved from
Übersicht into a tab of their own, Vergleich, the second after Heute (they were
a view of Planumsatz first). The month layouts (Raster, Bahnen, Jahresmatrix)
stay under Planumsatz → Monate. Vergleich and Planumsatz show money, so both
are there only for users who may see it.

## Old addresses

`resolveReportsUrl` (`src/lib/reports-url.ts`, tested) sends an old address on
with a 307, keeping `year` and `period`:

| Old | New |
| --- | --- |
| `tab=overview`, or no tab and no view | `/reports` — or `tab=compare` when `compare`/`chart`/`qyear`/`qcompare` is set (the old overview had no tab) |
| `tab=cockpit`, unknown tab | `/reports` |
| `tab=offers` | `/reports?open=offers` (the offers tile's sheet on Heute) |
| `tab=projects` | `/reports?tab=utilization` |
| `tab=customers` | `/reports?tab=revenue&view=customers` |
| `tab=revenue&view=compare`, `tab=revenue&view=cumulative` | `/reports?tab=compare` |

## Touched files

- `src/app/(admin)/reports/page.tsx` — rewritten around the four tabs
- `src/app/(admin)/reports/today-view.tsx` — new (Heute: tiles and their sheets)
- `src/app/(admin)/reports/tile-board.tsx` — new (client: which tile's sheet is open)
- `src/app/(admin)/reports/jobs-view.tsx` — new (Aufträge & Baustellen)
- `src/app/(admin)/reports/usage-view.tsx` — new (Auslastung)
- `src/app/(admin)/reports/gaps-view.tsx` — new (Datenlücken)
- `src/app/(admin)/reports/order-situation.tsx` — four classes, no money/backlog tiles, no crew row
- `src/lib/reports.ts` — `getToday` (incl. who is on which site today), `getDataGaps`, `getCrewUsage` added; `getPipeline`, `getCockpit`, `getDataQuality` removed; `getProjectEfficiency` files jobs by their end and leaves Altbestand out
- `src/lib/cockpit.ts` — stage rows, overdue rule, site groups
- `src/lib/data-gaps.ts` — new
- `src/lib/order-situation.ts` — `crewUsage`, `classTotals`
- `src/lib/reports-calc.ts` — `customerTotals`, `lostCustomers`
- `src/lib/reports-url.ts` — new
- `src/components/param-tabs.tsx` — optional `clears`: switching the main CRM tab drops the other tabs' choices (`TAB_CHOICES`)
- `src/app/(admin)/dashboard/page.tsx`, `src/app/(admin)/projects/[id]/time-summary.tsx` — links
- `messages/de.json`, `messages/en.json` — new `reports.*` keys, a few relabelled
- Tests: `tests/unit/cockpit.test.ts`, `data-gaps.test.ts`, `reports-url.test.ts`, `order-situation.test.ts`, `reports-calc.test.ts`, `tests/db/reports.test.ts`
- Removed: `src/app/(admin)/reports/cockpit.tsx`

## Rollback

1. `git revert` the commit that introduced this file (or check out
   `src/app/(admin)/reports/page.tsx`, `src/lib/reports.ts`,
   `src/lib/cockpit.ts`, `src/app/(admin)/reports/order-situation.tsx`,
   `messages/*.json` and the tests from the commit before it).
2. Delete `src/lib/reports-url.ts`, `src/lib/data-gaps.ts`, the four
   `*-view.tsx` files, `tile-board.tsx` and their tests.
3. Restore the old links in the dashboard (`/reports?tab=offers`) and the time
   summary (`/reports?tab=projects`).
