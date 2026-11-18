# CHANGE: Rain warnings two weeks ahead, on the overview and the project

## What changed

Rain on outdoor work (a work category ticked *Außenarbeit*) was warned of for
the current week on the overview and in the schedule. It now looks **14 days
ahead**, says **how sure** each day is, and also shows on the **project card**
(`/projects/card/<id>`) and the **project page**.

- **Horizon and confidence** (`src/lib/rain-days.ts`). Open-Meteo gives 16
  days; we take 14. For Germany its forecast is built on the DWD's ICON models:
  ICON-D2 (2 km) for 2 days, ICON-EU (7 km) for 5, global ICON and its
  ensemble for 7.5. Beyond that only the global GFS and ECMWF models (~25 km)
  remain, and the rain probability comes from coarse ensembles. So days 1–7
  (today + 6) are a **firm** warning; days 8–14 are a **Tendenz**, drawn grey
  and marked "noch unsicher". Days 15–16 are left out: they add little beyond
  the season. `RAIN_HORIZON_DAYS` and `RAIN_FIRM_DAYS` change the split.
- **Which days count** (`rainPlan`). The project's schedule days from today on,
  cancelled ones left out. When it has none from today on: its planned
  start–end range, Monday to Friday (a start without an end is one day).
  Only outdoor work (see below) with a town or coordinates; never
  completed/invoiced/paid/cancelled, done-ticked, paused or archived.
- **What is outdoor work** (`src/lib/outdoor-work.ts`, `outdoorWork`). A work
  category ticked *Außenarbeit*, as before — **or** a plaster, paint or
  lacquer trade (name starting Putz/Maler/Anstrich/Lackier, or
  Plaster/Paint/Lacquer) whose own words name the outside: the work note
  ("Art der Arbeit (frei)"), then the title it came in with (`sourceTitle`),
  then the description. Words that count: anything with *Fassad…*
  (Fassade, Westfassade, Fassadenputz), *Außen…/Aussen…* followed by putz,
  anstrich, arbeit, fassade, sockel, streich, farb, maler, beschicht, bereich
  or fläche, "Außen- und Innenputz", "innen und außen". Not "nach außen",
  "Außenecke", "Außenwand" — too often meant from the inside. An indoor trade
  (Trockenbau, Boden …) is never read. The office's facade jobs are booked as
  Putz or Malern about as often as Außenfassade, which is why: on a copy of
  the real data (31 Oct 2026) open projects counting as outdoor went from 30
  to 42, all projects from 132 to 176; of the 44 added, 38 by the description
  and 6 by the title.
  A project counted by its words says so under its rain block ("Als
  Außenarbeit gewertet: „Außenputz“ in der Beschreibung"), so a wrong guess is
  seen and the text put right. The schedule's warnings use the same rule
  (`isOutdoorJob`).
  Known limits: a job with inside and outside plaster ("Innen- und
  Außenputz") is warned on all its days, the inside ones too; jobs that say
  only "Garage", "Carport", "Dachvorsprung" or "Gerüst steht" are not
  counted.
- **The card's "Art der Arbeit" as written** (`Project.workTypeText`,
  migration `20261103130000_project_work_type_text`): the Trello importer
  turns "Außenputz" and "AP" into the trade Putz, which keeps no trace of the
  outside. The importer now also keeps every entry as written, on every
  import, and the rule reads it after the work note — the facade words as
  above, and "AP" when it stands as an entry of its own ("IP, AP"). Not
  shown and not in the name. Projects get it on their next Trello import (the
  server's hourly sync).
- **What is warned** (`rainDays`): a planned day whose highest rain
  probability reaches the threshold (Einstellungen → Wetterwarnung, default
  60 %), with the day's rain amount in mm (`precipitation_sum`).
- **Overview**: the "Wetter" card is now "Regen auf Außenarbeiten (14 Tage)":
  one line per day and project — date, project (link), town (when the card is
  wide enough), probability and mm — split into "Nächste 7 Tage" and
  "Tag 8–14 · Tendenz". Its query only runs when the card is shown.
- **Project card and page**: a small block (`src/components/project-rain.tsx`)
  under the card's meta row and under the page's customer line, streamed in a
  `Suspense` so the forecast never holds the card up. With no rainy day it is
  one grey line ("Kein Regen ab 60 % an den 7 geplanten Arbeitstagen …"); when
  nothing can be said it names why (no outdoor work category, town missing or
  not found, no schedule days and no planned range, no work days in the next
  14 days, service unreachable). Paused, archived and closed projects show
  nothing.
- **Schedule**: its weather warnings for days 8–14 carry "(Tendenz, noch
  unsicher)". The map is unchanged apart from reading the same cached forecast.
- **Board cards**: no rain marker. It would add a forecast lookup for every
  outdoor card to every board load and a fourth thing on cards that are
  already dense; the card's block and the overview cover it. Easy to add later
  from `getProjectsRain` if the office asks.

## Calls, caching, licence

- One call per **place** for the whole window: `forecast_days=14`,
  `timezone=Europe/Berlin` (so a day is a German calendar day), coordinates
  rounded to 2 decimals (~1 km). The address is the same for the overview, the
  schedule, the map and every card, so Next's data cache (`revalidate: 3600`)
  shares one answer per place per hour. Towns without stored coordinates are
  geocoded by name as before (cached a day).
- Volume: ~24 calls a day per distinct place; 50 sites ≈ 1,200 a day, well
  inside the free limits (10,000/day, 5,000/hour, 600/minute).
- **Licence**: Open-Meteo's free API is for **non-commercial use only**; the
  data is CC BY 4.0. A company's internal tool counts as commercial, so the
  client needs the smallest paid plan ("API Standard", 1 M calls/month) to be
  on the safe side. When it is bought, set `OPEN_METEO_API_KEY` on the server:
  the module then asks `customer-api.open-meteo.com` with that key — no code
  change. Without the key it keeps using the free API as before.
- `WEATHER_STUB=1` (ignored in production) invents a fixed forecast per place,
  for screenshots and trying things out with invented data.

## Files

- `src/lib/rain-days.ts` (new) — window, confidence, which days, what is warned.
- `src/lib/rain-db.ts` (new) — the project fields it reads (trade names, work
  note, original title, description too); the overview's query, which now
  sorts out outdoor work after reading instead of in SQL.
- `src/lib/outdoor-work.ts` (new) — `outdoorWork`, `facadeWord`, `mayBeOutside`.
- `src/lib/weather.ts` — one fixed call per place (14 days, probability +
  amount, Berlin days, optional key, stub); `getRainWarnings` now returns
  `amount` and `confidence`; new `getProjectsRain`; `isOutdoorJob` asks `outdoorWork`.
- `src/components/project-rain.tsx` (new) — the block on card and page; `RainAmount`.
- `src/app/(admin)/dashboard/page.tsx` — the weather card.
- `src/app/(admin)/projects/[id]/project-detail.tsx` — `rainBlock`, placed
  once in the card branch and once in the page branch (6 lines, nothing else).
- `src/app/(admin)/schedule/page.tsx` — the trend wording; reads the trade
  names, work note, original title and description for `isOutdoorJob`.
- `messages/de.json`, `messages/en.json` — `dashboard.weatherTwoWeeks`,
  `weatherFirm`, `weatherTrend`, `weatherSource` (replacing
  `weatherThisWeek`), `noWeatherWarnings` and `settings.weatherHint` reworded,
  `schedule.weatherWarningTrend`, new namespace `rain` (with
  `outdoorByText`).
- `docs/BENUTZERHANDBUCH.md` — overview, project form, schedule, settings, FAQ.
- `tests/unit/rain-days.test.ts`, `tests/unit/outdoor-work.test.ts` (new).

- `prisma/schema.prisma`, `prisma/migrations/20261103130000_project_work_type_text`,
  `src/lib/trello/import.ts` — `Project.workTypeText`, filled from the card.

One nullable column (`workTypeText`); no new setting.

## Rollback

1. `git revert <commit>` — or by hand:
2. Delete `src/lib/rain-days.ts`, `src/lib/rain-db.ts`,
   `src/components/project-rain.tsx`, `src/lib/outdoor-work.ts`,
   `tests/unit/rain-days.test.ts`, `tests/unit/outdoor-work.test.ts`.
   To take back only the facade words and keep the two weeks: in
   `rainPlan` and `isOutdoorJob` go back to "a trade ticked outdoor", put
   `workCategories: { some: { workCategory: { outdoor: true } } }` back into
   `upcomingOutdoorProjects` and drop its filter, remove the `byText` line in
   `project-rain.tsx` and the `rain.outdoorByText` key.
3. Restore `src/lib/weather.ts`, `src/app/(admin)/dashboard/page.tsx`,
   `src/app/(admin)/schedule/page.tsx`, `messages/*.json` and
   `docs/BENUTZERHANDBUCH.md` from the commit before; in `project-detail.tsx`
   remove the `Suspense`/`ProjectRain` imports, `rainBlock` and its two uses.
4. For "Art der Arbeit" alone: drop `workTypeText` from `OUTDOOR_TEXT_FIELDS`,
   `AP_ENTRY`, the importer's `cardData` and the two selects; the column can
   stay, or `ALTER TABLE "Project" DROP COLUMN "workTypeText";` with the
   migration's row removed from `_prisma_migrations`. Otherwise nothing to undo in the database. `OPEN_METEO_API_KEY`, if set, is then
   simply unused.
